# Session Context

## User Prompts

### Prompt 1

We need to analyze the review process and make it better. here is the postmortem report from a recent incident - @docs/postmortems/2026-03-21-search-escape-bug.md

### Prompt 2

i am seeing this requires multiple ways.. We need to make the reviewer persona dynamic and not stick to 1 or 2. Or probably use the claude built in codereview skill along with our triple layer review.. this may enhance our review process. One other way i look is to create dynamic reviewer persona based on changes we made - like SQL expert if db related changes, react expert if react app changes and node expert for backend changes. they should not be too narrow which misses domain or general t...

### Prompt 3

I think point 4 and 5 are specific to the bug we discovered.. i am looking for general hooks or agent prompt updates that will ensure future issues like this can be averted

### Prompt 4

yes, go ahead. use feature branch to make this changes and create a PR

### Prompt 5

Base directory for this skill: /Users/melagiri/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5/skills/brainstorming

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation ...

