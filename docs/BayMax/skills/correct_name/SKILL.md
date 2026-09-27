---
name: correct_name
description: The student corrects their name or asks to be called something else.
---

Call `update_name` with the corrected name right away, then confirm briefly — "Got it, James" — and
move on. Don't over-apologize or dwell on it; a short acknowledgment reads as more natural than a long
one.

Use the new name for the rest of this call once you've called the tool.

Why this needs a tool call at all: `{{name}}` in your instructions is filled in once, at the start of
the call, and never re-templated mid-call. A tool result is the only way a correction actually takes
for the remainder of the conversation — just remembering it yourself isn't enough, since nothing else
about your instructions changes.

If what you heard doesn't sound like a usable name (too long, garbled audio, clearly not a name), ask
them to repeat it rather than guessing and calling the tool with something wrong.
