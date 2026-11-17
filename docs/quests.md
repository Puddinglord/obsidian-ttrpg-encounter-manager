# Quests

![A GM's quest note, with the hook in a quest box and its objectives, beside the Campaign panel's Quests folder](images/quest.png)

Every job, rescue and bounty in your campaign can have a note of its own. Quests live in the campaign's **Quests** folder, link from anywhere with `/quest`, and show where they stand: open quests sit at the top of the folder, finished ones drop below them.

## Making a quest

New campaigns come with a **Quests** folder. Make a quest with any of these:

- the **+** on the Quests folder in the [Campaign panel](campaigns.md)
- **New quest** on the **Campaign** heading's **+**
- the **New quest…** command, in the command palette or [Spotlight](spotlight.md)

A quest made from a chapter's **+** is still saved in the Quests folder, so all your quests stay in one list. A folder called Quest log, Missions, Jobs or Bounties works the same way as Quests.

## What's in a quest note

A GM's quest note starts with the hook in a quest box, then a checklist of objectives and headings to fill in or delete. Here's the sample adventure's side quest:

````markdown
---
nimble: quest
status: available
type: side
giver: Wick's fence
location: "[[Q4 Shattered Laboratory]]"
reward: 40 gp, more for the silver
level: 2
---
```box quest title="The hook"
[[Wick]] went into the vaults two nights ago after the Magistrix's silver and hasn't come out. His fence pays 40 gp to anyone who brings him back, and more for the silver.
```

## Objectives
- [ ] Find Wick
- [ ] Get him out alive
- [ ] Bring back the silver (optional)

## Stakes
- **If they succeed:** a friend in the Old Quarter's back rooms, and a thief who knows the vaults.
- **If they fail or walk away:** Wick's bite goes bad and the hounds find him first.

## The truth
Wick is hiding under the fallen cabinet in [[Q4 Shattered Laboratory]]. He has one of Vess's letters and thinks it's worth more than the silver.

## Clues & leads
- Hound tracks with a limp's drag marks lead east from [[Q2 Mercury Pool]].

## Complications
- He's lying on the intact alchemist's kit and won't say so.

## Rewards
- 40 gp from the fence, more for the silver.

## Progress
-
````

The headings are prompts. **The truth** is for what the heroes don't know yet; **Progress** is where you note what happened each session. Delete any you don't need.

## Properties

The properties hold the quick facts. They show as a row of tags in reading view.

| Property | Meaning | Example |
|---|---|---|
| `status:` | `available` (not offered yet), `active`, `completed` or `failed`. Anything else counts as still open | `status: active` |
| `type:` | `main`, `side`, `personal`, or your own word | `type: main` |
| `giver:` | Who asked. Link the NPC to get their chip | `giver: "[[Tobren Kask]]"` |
| `location:` | Where it leads | `location: "[[Vess's Workshop]]"` |
| `reward:` | What it pays | `reward: 60 gp each, half paid` |
| `level:` | The hero level it's meant for (GM quests only) | `level: 2` |

## Open, finished and failed

![The Quests folder: an open quest at the top and a completed one ticked and sorted below it](images/guide-quests-folder.png)

The Quests folder in the Campaign panel lists open quests first.

| Set `status:` to | The quest |
|---|---|
| `available`, `active` or anything else | stays at the top with the open quests |
| `completed` | gets a green tick and moves below the open ones |
| `failed` or `abandoned` | is crossed out and moves below the open ones |

Objectives are ordinary checkboxes, so you can tick them off in reading view as the party gets things done.

## Linking a quest

![/quest typed in a session note, with the menu listing the campaign's quests, each with its status, type and giver](images/guide-quest-suggest.png)

Type `/quest` in any note to link one of the campaign's quests, the way `/npc` links an NPC. On its own it lists every quest, open ones first, with its status and who gave it. Type a few letters to narrow it down: `/quest wick` finds **Bring Wick Home**.

A link to a quest shows as an orange pill with a flag, in reading view and Live Preview. The flag turns into a tick once the quest is `completed` and a cross once it's `failed`, so a session log that mentions a quest shows at a glance whether it's still open:

![A session's prep checklist with link pills: a location, scenes, the map, a quest and NPCs](images/feature-pills.png)

```markdown
Brakka took [[The Guild's Quiet Job]] from [[Tobren Kask]] and promised Wick's fence
they'd look for him too ([[Bring Wick Home]]).
```

Links to other campaign notes get pills too: locations, maps, party members, monsters, handouts and sessions. See [Links to campaign notes](campaigns.md#links-to-campaign-notes).

`/quest` only links quests. Make new ones in the Campaign panel. The styled quest box on its own (for a hook in a scene note) is `/hook`; see [Boxes](boxes.md).

## Quests in a campaign you play in

In a campaign you [play in](players.md), a new quest is written from your side of the table, with no GM secrets. It starts as `status: active`:

````markdown
---
nimble: quest
status: active
type: main
giver: "[[Tobren Kask]]"
location: "[[Vess's Workshop]]"
reward: 60 gp each, half paid
---
```box quest title="The job"
Kask wants us to go under the Old Quarter, find out what happened to Magistrix Vess, and bring back her research notes. 60 gp each, half up front.
```

## Objectives
- [x] Take the job
- [ ] Find out what Vess was making down there
- [ ] Bring Kask her notes

## What we know
- The Guild "lost touch" with her. [[Sister Odile]] says Vess wrote to them for months.

## Leads
- [ ] Ask Odile what the silver light was

## Questions
- Why did he pay half up front without haggling?

## Progress
- [[Session 1 - Down the Cellar Stair]]: took the job and found the stair under the workshop.
````

Set it to `completed` or `failed` when it's over and it moves to the bottom of the Quests folder, the same as a GM's.
