/**
 * The worker half of the synchronous database client.
 *
 * It does the actual HTTPS request to the Supabase Management API, then hands
 * the result back through a MessagePort and releases the main thread with
 * Atomics.notify. The main thread is blocked in Atomics.wait the whole time,
 * which is what lets the harness stay written as ~700 plain synchronous
 * assertions instead of becoming an async rewrite where a forgotten `await`
 * silently turns a security assertion into a passing no-op.
 */
import { parentPort } from "node:worker_threads";
import { Agent, request } from "node:https";

const agent = new Agent({ keepAlive: true, maxSockets: 4 });

function post({ projectRef, token, sql }) {
  const body = JSON.stringify({ query: sql });
  return new Promise((resolve) => {
    const req = request(
      {
        agent,
        method: "POST",
        host: "api.supabase.com",
        path: `/v1/projects/${projectRef}/database/query`,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", (e) => resolve({ status: 0, text: JSON.stringify({ message: String(e) }) }));
    req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The Management API rate-limits after ~1,900 statements in a run, and a 429
 * arrived as "ERR ThrottlerException" — a failed CHECK that tested nothing.
 * Back off and resend the identical statement: each probe is its own
 * `begin … rollback`, so a resend is the same test, not a second write.
 */
async function postWithBackoff(args) {
  const waits = [1500, 3000, 6000, 12000];
  let last;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    last = await post(args);
    const throttled = last.status === 429 || /Too Many Requests|ThrottlerException/.test(last.text);
    if (!throttled) return last;
    if (attempt < waits.length) await sleep(waits[attempt]);
  }
  return last;
}

/** One statement in, one {rows} or {error} out. */
async function runOne({ projectRef, token, sql }) {
  let payload;
  try {
    const { status, text } = await postWithBackoff({ projectRef, token, sql });
    if (status >= 400) {
      let message = text.slice(0, 2000);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) message = parsed.message;
      } catch { /* keep the raw body */ }
      payload = { error: message };
    } else {
      const parsed = JSON.parse(text);
      /* The endpoint answers with the rows of the last statement that produced
         any. An empty result is `[]`, which is exactly what a correct denial
         looks like, so it must not be confused with a failure. */
      payload = { rows: Array.isArray(parsed) ? parsed : (parsed?.rows ?? []) };
    }
  } catch (e) {
    payload = { error: String(e?.message ?? e) };
  }
  return payload;
}

parentPort.on("message", async ({ signal, port, projectRef, token, sql, sqls }) => {
  let payload;
  if (Array.isArray(sqls)) {
    /*
     * A phase's probes, issued together.
     *
     * Each one is still its own `begin; … rollback;` on its own connection —
     * exactly the statement that would have been sent one at a time. Nothing
     * about isolation changes; what changes is that the ~1.9s of network wait
     * happens once for the group instead of once per probe.
     *
     * Bounded concurrency, because an unbounded fan-out of a few hundred
     * requests gets rate-limited and then looks like a test failure.
     */
    const results = new Array(sqls.length);
    const LIMIT = 12;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(LIMIT, sqls.length) }, async () => {
        for (;;) {
          const i = next++;
          if (i >= sqls.length) return;
          results[i] = await runOne({ projectRef, token, sql: sqls[i] });
        }
      }),
    );
    payload = { batch: results };
  } else {
    payload = await runOne({ projectRef, token, sql });
  }
  port.postMessage(payload);
  /* Store THEN notify, and only after the message is queued — the main thread
     wakes and immediately calls receiveMessageOnPort, which must find it. */
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
