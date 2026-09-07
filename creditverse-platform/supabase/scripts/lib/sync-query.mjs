/**
 * A synchronous database client for the RLS matrix.
 *
 * WHY THIS EXISTS
 *
 * The harness used to run every statement through
 * `npx --yes supabase@latest db query`. Measured on this machine: 5.65 seconds
 * per statement, of which about 5.4s was npm resolving the package and booting
 * the CLI. A full run issues roughly 2,300 statements, so over three hours of
 * the runtime was process startup — none of it testing anything.
 *
 * This speaks to the SAME Management API endpoint the CLI speaks to, with the
 * SAME token the CLI stores, over one keep-alive connection. The SQL, the
 * roles, the JWT claims and the transaction boundaries are untouched. Nothing
 * about what is asserted changes; only the way the bytes get there.
 *
 * It is synchronous by design. The alternative — making the harness async —
 * would mean rewriting ~700 assertions, and a missing `await` in a security
 * test does not fail loudly: it passes.
 *
 * The token is read from the keychain into memory and is never written,
 * logged, printed or passed on a command line.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

/**
 * The linked project's ref, as the CLI records it. Resolved from THIS file's
 * location rather than the caller's, so it does not depend on where the
 * harness happens to be imported from.
 */
export function readProjectRef() {
  return readFileSync(new URL("../../.temp/project-ref", import.meta.url), "utf8").trim();
}

export function readAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    return execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("No Supabase access token. Run `npx supabase login`, or set SUPABASE_ACCESS_TOKEN.");
  }
}

export function createSyncQuery({ projectRef, token, baseUrl }) {
  const worker = new Worker(new URL("./query-worker.mjs", baseUrl ?? import.meta.url));
  worker.unref();
  const stats = { count: 0, batches: 0, ms: 0 };

  /** The blocking round trip, shared by the single and batched forms. */
  const send = (message) => {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    worker.postMessage({ signal, port: port2, projectRef, token, ...message }, [port2]);
    Atomics.wait(signal, 0, 0);
    const received = receiveMessageOnPort(port1);
    port1.close();
    if (!received?.message) throw new Error("no response from the query worker");
    return received.message;
  };

  /**
   * Many statements, one blocking wait.
   *
   * Returns them in the order given, each as {rows} or {error}. Every one is
   * still an independent transaction on its own connection — this is a
   * transport optimisation, not a change to what any probe tests.
   */
  const queryMany = (sqls) => {
    if (sqls.length === 0) return [];
    const started = Date.now();
    const payload = send({ sqls });
    stats.count += sqls.length;
    stats.batches += 1;
    stats.ms += Date.now() - started;
    if (payload.error) throw new Error(payload.error);
    return payload.batch;
  };

  const query = (sql) => {
    const started = Date.now();
    const payload = send({ sql });
    stats.count += 1;
    stats.batches += 1;
    stats.ms += Date.now() - started;
    if (payload.error) throw new Error(payload.error);
    return payload.rows;
  };

  return { query, queryMany, stats, close: () => worker.terminate() };
}
