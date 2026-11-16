---
name: unslop
description: Cut AI tells from prose a person will read, and give it a voice. Use before writing a Markdown file, a commit message, a pull request body, a report or a reply of more than a few sentences, and when asked to unslop, edit or review writing. The house-rules hooks refuse a Markdown write until the agent making it has loaded this skill.
---

# Unslop

Edit text to remove AI patterns and add a human voice.
Apply it to what you write as you write it, and to any text you are asked to edit.
Where it disagrees with the user's own instructions, theirs win.

## Process

1. Scan for the patterns below.
2. Rewrite.
   Preserve the meaning and match the intended tone.
3. Add soul, as the next section says.
4. Self-audit: ask "What makes this obviously AI generated?" and fix the tells that remain.

## Adding soul

Removing patterns is half the job.
Sterile, voiceless writing is just as obvious.

- **Have opinions.**
  React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.**
  Short sentences.
  Then longer ones that take their time.
  Mix it up.
- **Acknowledge complexity.**
  "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.**
  First person isn't unprofessional.
- **Let some mess in.**
  Perfect structure looks machine-made.
- **Be specific.**
  Not "this is concerning" but "there's something unsettling about agents churning away at 3am."

A reference or a spec stays dry: `house-rules:technical-writing` says which kinds of document take a view.

## Patterns to detect and fix

Rule numbers are stable ids that other skills cite, and they match the list this skill was ported from.
A removed rule leaves a gap.
Rules 1, 2, 4, 6 and 21 left that list, and rule 14, against a colon in mid-sentence, is not taken here, since the user's own writing uses that colon.

### Content

3. **Superficial -ing phrases.**
   "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...".
   Delete them, or expand them with real sources.
5. **Vague attributions.**
   "Experts believe", "Industry reports suggest", "Some critics argue".
   Name the source or delete the claim.

### Language

7. **AI vocabulary.**
   Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant.
   Replace them with plain words.
8. **Fancy ways to say "is".**
   "serves as", "stands as", "boasts", "features".
   Say "is" or "has".
9. **"Not just X, but Y."**
   State the point directly instead.
10. **Rule of three.**
    Don't force ideas into groups of three.
    Use the natural number.
11. **Synonym cycling.**
    Protagonist, main character, central figure and hero, all in one paragraph.
    Pick one and repeat it.
12. **False ranges.**
    "from X to Y" where X and Y aren't on a meaningful scale.
    List the topics directly.

### Style

13. **Em dashes.**
    Never write one: the house-rules hooks refuse it.
    A period or a comma usually does the job.
    Where a dash reads best, use a plain hyphen with a space on each side, as the user's rule says.
    Don't trade the em dash for an en dash or a parenthetical aside, which read as the same tell.
15. **Boldface overuse.**
    Don't bold every proper noun or acronym.
16. **Inline-header lists.**
    The tell is a bold label and colon that restates the line: `**Performance:** Performance improved...`.
    Convert those to prose.
    A bold lead-in that names the item and is followed by genuinely new detail is fine, not a tell: `**Schema in TypeScript.** Tables live in one file.`
    So is a field that a format asks for, such as `**Evidence:**` in a review finding.
17. **Heading case.**
    Use sentence case in a new document or a new set of them.
    In a set that already settled on title case, keep it: a set that mixes the two reads worse than either.
18. **Decorative emojis.**
    Remove them from headings and bullets.
    An emoji that carries meaning, such as a severity marker a report format defines, stays.
19. **Curly quotes.**
    Use straight quotes.

### Communication artifacts

20. **Chatbot phrases.**
    "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!"
    Remove them.
22. **Sycophantic tone.**
    "Great question!", "You're absolutely right!"
    Respond directly.

### Filler

23. **Filler phrases.**
    "In order to" becomes "To".
    "Due to the fact that" becomes "Because".
    Delete "It is important to note that".
24. **Excessive hedging.**
    "could potentially possibly be argued that it might" becomes "may".
25. **Generic conclusions.**
    "The future looks bright."
    State specific plans or facts.

### Jargon

26. **Abstract metaphor nouns.**
    Substrate (base), wedge or wedge in (add), vector (way, method), locus, vantage, nexus, primitive as a noun, harness as a metaphor, surface as in "API surface", bedrock, scaffolding as a metaphor, modality, paradigm, gold-plating (more than the job needs), ratchet as a metaphor (the mechanism's real name, or a limit that only tightens), evacuate for moving code (move out), endgame (the last phase), north star, flywheel.
    These read as technical but usually have a plainer concrete word.
    Pick the concrete word.

### Plain speech

27. **Say what it does, not how it feels.**
    "the database stays close at hand", "SQL you can read" and "types that follow your schema" name a feeling.
    The fix names the mechanism or a number: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build".
    Ask what the sentence tells the reader to do or know, then write that.
    If you can't restate it as a concrete instruction, fact or number, cut it.
    One more check: if the sentence could appear unchanged in another project's docs, it says nothing about this one, so cut it.
28. **Shorten or split dense sentences.**
    If the reader has to backtrack to parse a sentence, break it in two or drop clauses.
    One idea per sentence.
29. **Active voice.**
    Prefer it.
    Catch "is/are/was/were + past participle" and name the actor: "queries are validated" becomes "the compiler validates queries", and "the file is parsed by the loader" becomes "the loader parses the file".
    Passive is fine only when the actor is unknown or doesn't matter.
30. **Cut adverbs, or use a stronger verb.**
    "runs quickly" becomes "is fast" or the number, and "significantly improves" becomes the measured delta.
    An adverb propping up a weak verb means the verb is wrong.
31. **Prefer the plain word.**
    "utilize" and "leverage" become "use", "facilitate" becomes "help", "numerous" becomes "many", and "in the event that" becomes "if".
    The fancier synonym is rarely clearer.
32. **Mannered prose.**
    Metaphor or flourish where a literal phrase exists: aphorisms ("wire it or delete it"), rhetorical fragments for effect, personified code ("the plan holds it"), figurative verbs ("rides along", "stands on"), and stock framing phrases.
    "A dial worth turning" becomes "a parameter worth varying".
    Say what you mean.
    Rule 26 covers the metaphor nouns.
33. **Over-compression.**
    Dropped articles, verbless fragments, symbol-speak, and abbreviations that make the reader decode instead of read.
    "Parser rejects bad date → exit 2, no write" becomes "The parser rejects a bad date, exits with code 2, and writes nothing."
    Write whole sentences with their articles and verbs, and spell out arrows and abbreviations.
