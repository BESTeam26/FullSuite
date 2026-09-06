/**
 * When a regulator is worth involving, and what each one actually does.
 *
 * Dee, 2026-09-06: "Filing FTC and CFPB is something that can be recommended
 * but these are not done in the system. Explain when and how to use FTC and
 * CFPB and AG filing effectively esp to provide consumer guidance — this is
 * education part, then let them decide if they need to use them."
 *
 * So this module recommends and explains. It does not file, and neither does
 * anything else in the platform. The consumer reads, decides, and files in
 * their own name — which is also the only way it works, because every one of
 * these channels is the consumer's to use.
 *
 * ── The correction this content exists to make ──────────────────────────────
 *
 * Older dispute material tells consumers to write "this is being investigated
 * by the FTC" on a letter after submitting a complaint. That is almost always
 * untrue, and a bureau that recognises the phrase discounts everything else in
 * the letter. Filing a complaint is not an investigation. The distinction is
 * spelled out below for each channel, because getting it wrong costs more than
 * saying nothing.
 *
 * Everything here is general information about public complaint processes, not
 * legal advice, and it says so where a consumer will see it.
 */

export type RegulatorChannel = "cfpb" | "ftc_identity_theft" | "ftc_complaint" | "state_ag" | "bbb";

export interface ChannelGuidance {
  channel: RegulatorChannel;
  name: string;
  where: string;
  /** One line: what this channel is actually for. */
  purpose: string;
  /** The honest version of what happens after you file. */
  whatItDoes: string[];
  /** The part people get wrong, stated plainly. */
  whatItDoesNotDo: string[];
  /** Conditions in the case record that make this worth doing. */
  useWhen: string[];
  /** When it will waste the consumer's time or damage the file. */
  doNotUseWhen: string[];
  /** What to have ready before starting. */
  prepare: string[];
  /** What actually happens, and roughly how fast. */
  expect: string;
}

export const REGULATOR_GUIDANCE: ChannelGuidance[] = [
  {
    channel: "cfpb",
    name: "Consumer Financial Protection Bureau complaint",
    where: "consumerfinance.gov/complaint",
    purpose: "Makes the company answer you in writing, on a clock, where a regulator can see it.",
    whatItDoes: [
      "Routes your complaint to the company itself, which is expected to respond — usually within about 15 days, and in most cases finally within 60.",
      "Creates a dated record outside the company's own systems, which matters if this ever goes further.",
      "Puts the complaint in a public database, without your name.",
      "Often reaches a different team from the one handling ordinary disputes, which is the real reason it sometimes moves an item that three letters did not.",
    ],
    whatItDoesNotDo: [
      "It does not investigate your individual case. The CFPB routes and tracks; the company answers.",
      "It does not force a deletion. A company can respond by explaining why it believes its reporting is correct.",
      "It does not replace a dispute. If you have not disputed with the bureau first, the company will say so and the complaint achieves nothing.",
    ],
    useWhen: [
      "You have disputed at least once and hold the written result.",
      "The same specific field is still wrong after that result.",
      "You have dates: when you wrote, what came back, what is still there.",
    ],
    doNotUseWhen: [
      "You have not disputed with the bureau yet.",
      "You are unsure whether the information is actually wrong.",
      "The only thing you can point to is that you dislike the account being reported.",
    ],
    prepare: [
      "The exact field that is wrong and what it should say.",
      "The date of each dispute and a copy of each response.",
      "A copy of the report page showing the item as it appears today.",
    ],
    expect: "A company response in writing, usually within 15 days. You can dispute the response if it does not address what you raised.",
  },
  {
    channel: "ftc_identity_theft",
    name: "FTC Identity Theft Report",
    where: "IdentityTheft.gov",
    purpose: "The one FTC route with real legal force — but only when identity theft actually happened.",
    whatItDoes: [
      "Produces an Identity Theft Report, which is a specific legal instrument, not a general complaint.",
      "That report is what a bureau needs before it will BLOCK information resulting from identity theft under 15 U.S.C. § 1681c-2, normally within four business days of receiving it.",
      "It also supports an extended fraud alert on your file.",
      "It generates a recovery plan and the letters that go with it.",
    ],
    whatItDoesNotDo: [
      "It does not start an investigation of your case. No one from the FTC will call you.",
      "It does nothing for an account that is genuinely yours and merely reported wrong. Blocking is for information that resulted from theft.",
    ],
    useWhen: [
      "An account or inquiry on your report was not opened or authorised by you.",
      "You are prepared to state that under penalty of perjury, because that is what the report is.",
    ],
    doNotUseWhen: [
      "The account is yours and the problem is a wrong balance, a wrong date, or a late mark you dispute. That is an accuracy dispute, and using an identity theft report for it is a false statement.",
      "You recognise the creditor but not the amount.",
      "A data breach was in the news and you are assuming a connection. A breach is not proof that a particular account is fraudulent.",
    ],
    prepare: [
      "Which specific items were not authorised by you, listed one by one.",
      "Government identification and proof of address.",
      "A police report if you have one, though it is not always required.",
    ],
    expect: "The report is issued immediately. Send it to the bureau with a block request; the bureau then has four business days to block, or must tell you why it will not.",
  },
  {
    channel: "ftc_complaint",
    name: "FTC consumer complaint (ReportFraud.ftc.gov)",
    where: "ReportFraud.ftc.gov",
    purpose: "Feeds enforcement data. Almost never changes your own report.",
    whatItDoes: [
      "Adds your report to a database law enforcement uses to spot patterns across many consumers.",
    ],
    whatItDoesNotDo: [
      "It does not contact the company on your behalf.",
      "It does not produce a response you can use.",
      "It does not make the FTC your representative, and saying so on a dispute letter is untrue.",
    ],
    useWhen: [
      "You want the conduct on record for pattern enforcement and expect nothing back.",
    ],
    doNotUseWhen: [
      "You need a response. Use the CFPB instead.",
      "You are about to write on a letter that the FTC is investigating your account. Filing is not an investigation, and a bureau that spots the claim will discount the rest of the letter.",
    ],
    prepare: ["A short factual description of what the company did."],
    expect: "An acknowledgement. Nothing more, and that is by design.",
  },
  {
    channel: "state_ag",
    name: "State Attorney General consumer complaint",
    where: "Your state Attorney General's consumer protection division",
    purpose: "Mediation with real local weight, and some states give you rights the federal law does not.",
    whatItDoes: [
      "Many states will forward the complaint to the company and ask for a response, which functions as mediation.",
      "Several states have their own credit reporting statutes that go further than the federal one, so a complaint may reach conduct a federal channel would not.",
      "It is on the record with the office that would bring a state enforcement action.",
    ],
    whatItDoesNotDo: [
      "It does not act as your lawyer or bring a case for you individually.",
      "It does not usually move faster than the CFPB.",
    ],
    useWhen: [
      "The CFPB route produced a response that did not address the facts.",
      "The conduct looks like a pattern rather than one clerical error.",
      "Your state has its own credit reporting statute worth invoking.",
    ],
    doNotUseWhen: [
      "It is your first step. Regulators expect the dispute process to have been used.",
    ],
    prepare: [
      "The whole correspondence record, in date order.",
      "A one-paragraph summary of what remains wrong.",
    ],
    expect: "Varies widely by state — from an acknowledgement to active mediation. Several weeks is normal.",
  },
  {
    channel: "bbb",
    name: "Better Business Bureau complaint",
    where: "bbb.org",
    purpose: "Reputational pressure only. It is not a regulator.",
    whatItDoes: [
      "Publishes the complaint and asks the company to respond, which some companies care about.",
    ],
    whatItDoesNotDo: [
      "It has no authority over credit reporting, no statutory power, and no ability to require anything.",
    ],
    useWhen: ["You have exhausted the real channels and want the record public."],
    doNotUseWhen: ["You are relying on it to fix the report. It cannot."],
    prepare: ["A short factual summary."],
    expect: "A company response or none. No enforcement either way.",
  },
];

export function guidanceFor(channel: RegulatorChannel): ChannelGuidance {
  const found = REGULATOR_GUIDANCE.find((g) => g.channel === channel);
  if (!found) throw new Error(`No guidance for ${channel}`);
  return found;
}

/** What the case record has to show before a channel is worth suggesting. */
export interface CaseFacts {
  disputedAtLeastOnce: boolean;
  holdsWrittenResult: boolean;
  stillWrongAfterResult: boolean;
  complianceContacted: boolean;
  cfpbFiled: boolean;
  cfpbResponseInadequate: boolean;
  /** Signed by the consumer. Never inferred from an unfamiliar account. */
  attestedIdentityTheft: boolean;
}

export interface Recommendation {
  channel: RegulatorChannel;
  /** Why it fits this case, in one line the consumer reads. */
  because: string;
}

/**
 * Which channels this case has actually reached. Suggestions only — the
 * consumer decides, and the platform never files.
 *
 * Ordered by what will help most, not by severity. A consumer with one
 * unresolved dispute is pointed at the CFPB, not at five channels at once,
 * because filing everywhere at the start is how a genuine complaint gets
 * treated as noise.
 */
export function recommendChannels(facts: CaseFacts): Recommendation[] {
  const out: Recommendation[] = [];

  /* Identity theft is its own track and does not wait for the dispute cycle:
     the block is faster than a reinvestigation and does not depend on one. */
  if (facts.attestedIdentityTheft) {
    out.push({
      channel: "ftc_identity_theft",
      because: "You have stated these items were not authorised by you. An Identity Theft Report is what lets a bureau block them, normally within four business days.",
    });
  }

  if (facts.disputedAtLeastOnce && facts.holdsWrittenResult && facts.stillWrongAfterResult) {
    out.push({
      channel: "cfpb",
      because: "You disputed, you have the written result, and the same thing is still wrong. That is exactly the record a CFPB complaint needs, and the company has to answer it.",
    });
  }

  if (facts.cfpbFiled && facts.cfpbResponseInadequate) {
    out.push({
      channel: "state_ag",
      because: "The company answered the CFPB without addressing what you raised. Your state may mediate, and some states give you rights the federal law does not.",
    });
  }

  if (facts.complianceContacted && facts.cfpbResponseInadequate) {
    out.push({
      channel: "bbb",
      because: "Every channel with real authority has been used. This one is public pressure only, and it will not fix the report by itself.",
    });
  }

  return out;
}

export const GUIDANCE_DISCLAIMER =
  "This explains public complaint processes so you can decide whether to use them. " +
  "You file in your own name; nothing here is filed for you. It is general information, not legal advice.";
