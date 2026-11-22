# Encounter flow research

How a fight actually runs in each game the encounter study covers, and what that means for a tracker the GM can rapid-fire through, in the sidebar and in a full-width main tab. This feeds the next pass of [encounter-design-study.html](encounter-design-study.html); the study's research boards cover each game's *look*, and this covers its *flow*.

**Sources.** Primary first: the user's rulebooks (Nimble Core Rules, Game Master's Guide, Nimble 5e; the Daggerheart Core Rulebook; the CoC 7e Keeper Rulebook; the PF2e Core Rulebook), cited by book and printed page and paraphrased. Then the SRDs, Archives of Nethys, Chaosium's rules wiki, and the official Foundry systems' docs and source. Then GM practice from forums and blogs. Reddit blocked automated fetches, so community views come from EN World, Paizo forums, BRP Central, blogs and module pages. Claims marked *secondary* or *unverified* need a book check before they're built.

**Book abbreviations:** Core (Nimble Core Rules, 2025), GMG (Nimble Game Master's Guide, 2025), N5e (Nimble 5e 1.1), CR (Daggerheart Core Rulebook), KR (CoC 7e Keeper Rulebook), CRB (PF2e Core Rulebook, 2nd printing).

## From the user: follow the table, never enforce it

- **Nimble heroes aren't clockwise.** At the user's tables, players say "I'll go next"; it's a democratic free-for-all. The plugin doesn't know seating anyway. So never suggest or assume an order among heroes: any hero can be next, in one tap.
- **Table level vs. plugin level.** Some mechanics live at the table (Daggerheart's spotlight tokens or action tracker, house rules, who speaks up). The plugin tracks what's useful digitally, but it **must never get in the way** whether the group follows the book, a variant, or nothing: any creature can act at any time, the GM can take or hand the spotlight whenever, and no button is blocked because a rule says it should be. Aids (counts, tokens, prompts) are optional, quiet, and never gate an action.

## From the user: keep the table talking

- **VTT tools cut out too much table talk.** The tracker supports the conversation at the table; it doesn't replace it. Be careful with automation like targeting: anything that does the talking for people (by-target resolution, auto-moving the spotlight) is at most an optional setting, off by default, and needs a good reason.
- **Most things subtle for the GM.** Player-answered moments (Defend, Interpose, an armor slot, Shield) are a quiet quick action on the GM's damage sheet, never a prompt that interrupts. A shared, synced player experience is a later conversation.
- **Simple keys over esoteric hotkeys.** Arrow keys move through participants, Enter or → selects, plus a few obvious ones (Space done, Z undo).

## From the user: visual rules

- **No coloured left-edge stripes.** A 3px accent bar down a card's side reads as generic AI design. Mark state with a full tint, a full outline, or a glyph or label.
- **Never stretch a label away from its value.** On a wide surface, a label pushed to one edge and its value to the other ends up next to a neighbour's label ("45" beside "DEX"). Keep each label and value together as one unit (a tile, a pill, a stacked pair), and let units wrap.
- **Centre what's meant to be centred** (tab rows, button groups that stand alone) and line up text by its capitals, not its line box.

## The short version

| Game | Turn model | What the GM presses most | The interruption that matters |
|---|---|---|---|
| **Nimble** | **Sides.** Heroes in any order (whoever wants to go next), then monsters as groups. Legendary monsters act **after every hero's turn**. | "Done" on a hero; the boss's after-hero action; one pack attack per target | The *hero's* Defend / Interpose on each monster attack (costs next turn's actions) |
| **Daggerheart** | **Spotlight.** No initiative, no rounds. Players pass it among themselves until a roll with Fear or a failure hands it to the GM; 1 Fear interrupts. | Logging the roll result (it moves Hope, Fear, the spotlight and countdowns) | Fear interrupt; extra adversaries at 1 Fear each; adversary reactions |
| **5e** | **Initiative**, fixed, grouped for identical monsters | Next | Legendary actions after *any* turn; reactions; concentration on damage; lair at 20 (2014) |
| **PF2e** | **Initiative** with Delay (leave and re-enter anywhere) and KO reorder | Next, plus turn-boundary bookkeeping | Reactions (Reactive Strike, Shield Block); Delay returns |
| **CoC 7e** | **DEX order**, readied guns at +50, holding allowed | Next, and the target's defence roll | Dodge / Fight Back / Dive for cover on nearly every attack; group Sanity rolls |

**Three conclusions for the design:**
1. **"Next" is not universal.** Only the initiative games have a queue. Nimble's main verb is *done, who's next?* on the heroes' side and *who attacks whom* on the monsters'. Daggerheart's is *log this roll*. The pinned main button should change verb per game, as the study already sketches, and so should the list beneath it: a queue, a tray, or a table.
2. **Rapid fire comes from killing the stat-block lookup and the per-attack pause.** Every game's slow moment is a monster's action read from a block, then a defender's choice (Defend, Shield, Dodge, Armor slot). The focus card should carry the acting creature's actions as buttons with dice, and the damage sheet should carry the *target's* reaction as a one-tap option.
3. **"Moments" that aren't creatures belong in the flow.** Nimble's after-hero boss beat, 5e's legendary prompts and lair row, PF2e's turn-boundary steps, CoC's end-of-round CON rolls, and Daggerheart's countdowns are where GMs forget things. The study's appendix already flags that core's queue needs to know about them.

## Nimble

Sources: the published *Nimble Core Rules* and *Game Master's Guide* (2025, the user's copies; cited "Core p." and "GMG p." by printed page), the *Nimble 5e* 1.1 rules ("N5e p."), the newer 3.3 core and 3.0 GMG drafts where they differ ("draft"), the official Foundry system's docs ([combat](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/combat.md), [monsters](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/monsters.md)), and the plugin's own [docs/tracker.md](../docs/tracker.md) and bundled bestiary (525 monsters: 454 regular, 29 solo, 22 legendary, 20 minion).

### Turn structure

1. **Roll Initiative.** Heroes only roll: d20 + Initiative. 1–9 starts with 1 action, 10–19 with 2, 20+ (or a natural 20) with all 3. Initiative decides *how much* a hero does on round 1, never *when* (Core p15; N5e p11). Monsters don't roll ([Foundry combat doc](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/combat.md)).
2. **Surprise.** Heroes who surprise get advantage on Initiative or start with 3 actions; surprised heroes roll with disadvantage, start with 1 action, or *the monsters all go first* (Core p15). Ambusher monsters (Mimic, Cloaker) "always start first" and give heroes disadvantage on Initiative (GMG p36, p41). Being hidden or striking first is not surprise (Core p15).
3. **Heroes' side.** By default the heroes go first. Whoever is ready goes first (Core p15; the book suggests clockwise after that, but at the user's tables it's whoever speaks up, and the plugin doesn't know the seating anyway). The Nimble 5e designer note is explicit about why: not polling, not writing names down, not tracking order is "a HUGE time saver… If the player next to you is going, YOU'RE going next" (N5e p11). The GM may let players swap turns occasionally (Core p15). A *turn* is one hero, or one monster group (Core p15).
   - A hero's turn: 3 actions (Attack, Move, Cast, Assess, …); extra attacks are Rushed (cumulative disadvantage); one free simple task. Actions refill **at the end of the hero's turn** (Core p13–15).
   - A Dying hero (0 HP) has at most 1 action; attacking costs a Wound unless they pass a DC 10 STR save; damage while Dying adds 2 Wounds (3 on a crit); 6 Wounds is death (Core p9). No death saves, nothing to roll at the start of a turn.
4. **After each hero's turn, every legendary (solo) monster acts.** "Legendary monsters act after EACH hero's turn" (GMG p43). Only after *heroes'* turns: not after minions, commoners or followers (GMG p43; [Nimble Nexus FAQ](https://nimble.nexus/rules/running-legendary-monsters)). Each time it picks one of (usually) two actions, "rec. alternate" (GMG p45). Variants in the bestiary: "choose 1 not yet chosen (reset when all have been chosen)" (GMG p61), "summon 1 blood bat minion, then choose 1", a duo where you "choose Kelebek OR Poppy" (GMG p45). Legendary teams: "You can have ALL of them attack after each hero, or take turns" (GMG p45). The Foundry system gives a solo monster no turn of its own on the monsters' side: "character, solo monster, character, solo monster…, with any regular monsters and minions acting at the end of the round" ([combat doc](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/combat.md#solo-monsters-get-extra-turns)).
5. **Monsters' side.** "Monsters will typically act last, though some monsters may be fast enough to act sooner… A monster (or monster group) should act at the same time each round" (Core p15). The GM may *move monsters up* mid-fight to make it harder: "If, after the first player's turn, it looks like the bad guys are in for a trouncing, move some of them up in the initiative order" (GMG p27).
   - A monster's turn: move (Speed 6 by default; it can replace an attack to move again), use the actions on its stat block, done. No Heroic Actions or Reactions, no Rushed Attacks, no opportunity attacks (GMG p25; Core p14). Stat blocks say how many: "Choose 1:", "Choose twice:", "Alternate each round:", "Claws (2×)" (bestiary `actionsIntro`, 42 blocks with a (N×) attack).
   - **Order among monsters is the GM's.** Nothing says one by one or all at once; a "turn" is a monster *or a group* (Core p15). Minions are explicit: "rather than moving them one at a time, all minions attacking a particular hero should move and attack at the same time… Roll and add up 5d6 (ignoring any 1s)" (GMG p25). Their combined damage is one attack, so one Defend covers the pack (GMG p25; Core p14).
6. **Round ends** when everyone has acted; heroes' 1/round reactions come back. Timing differs by printing: the published core resets 1/round abilities "whenever your own turn begins" (Core p15); the 3.3 draft says "ends". Durations tick per the plugin's timed statuses ([docs/tracker.md](../docs/tracker.md#timed-statuses)).
7. **Combat ends** when the monsters are dead or flee. The 3.0 draft GMG suggests Cowardly Monsters run once outnumbered or a leader falls. Legendary monsters go through **Bloodied** (half HP: a new ability) and **Last Stand** (at 0 HP they're dying: "20 more damage and he dies", GMG p45; the 3.0 draft instead "regains 7 HP/hero"). The plugin supports both (docs/tracker.md).

### What the GM does, moment by moment

| Moment | GM sees / decides / clicks | Where time goes today |
|---|---|---|
| Roll Initiative | Each player says their total; GM sets 1/2/3 actions per hero. | Typing totals; nothing else. Players can enter their own. |
| A hero acts | Mostly *listens*. Applies damage to a monster (armor math: Medium = dice only, Heavy = half dice in the published rules; −10/−20 in the drafts the plugin follows); answers Assess questions; adds conditions. | Finding the monster's row; armor math; noticing Bloodied at half HP; triggered passives ("whenever an attack misses you, deal 1 psychic", GMG p25). |
| That hero finishes | Marks them done. If a legendary is in the fight: **the boss acts now**: pick one of two actions (alternate), roll, pick a target, the target may Defend/Interpose. | Remembering the boss acts *every* time; remembering which action it used last; rolling its dice. |
| Next hero | Whoever says they want to go next. No fixed order. | Remembering who hasn't gone. Players lose track too. |
| Monsters' side | For each monster or pack: move, pick its action(s), roll, say the target. **Pause** while the target's player decides Defend (reduce by armor, costs 1 action off their next turn) or a friend Interposes. Apply damage. Next. | Opening stat blocks; rolling 5 minions one by one; tracking which heroes already Defended this round and how many actions they'll have; forgetting monsters' "1/round" and "(2×)" options. |
| Round end | Heroes' actions are full again (minus any reactions they spent). Statuses tick. | Recounting actions. |

**How experienced Nimble GMs rapid-fire the monster side** (the rules, the Foundry tooling, and table reports agree):
- **Groups, not individuals.** A turn is "one monster group"; packs of minions move and attack the same hero together, one summed roll (GMG p25). Foundry's Combat System panel selects several minions, picks their attack, targets, and rolls them as one card with one Apply Damage, then folds them into one tracker entry for the rest of the round ([combat doc](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/combat.md#minions-and-hordes)).
- **No stat-block hunting.** Foundry: "Don't open sheets mid-fight… the Combat System panel can roll monster and minion actions straight from the canvas" ([monsters doc](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/monsters.md)). Most Nimble stat blocks are two or three lines; the action menu fits on a card.
- **Monsters don't Defend.** Monster armor is flat precisely because "GMs have enough to juggle without… having to decide when to Defend against a dozen attacks each round" (GMG p25). The only per-attack pause is the *hero's* reaction.
- **Act-together by target.** "All minions attacking a particular hero" go together (GMG p25): the natural unit of the monsters' side is *who is being attacked*, not *which monster*.
- **The legendary's after-hero beat is short:** two options, alternate (GMG p45). Table reports: a solo that acts after every player turn "had my players on edge" and needs no minions or legendary actions ([EN World](https://www.enworld.org/goto/post?id=9838371)).

### Interruptions (need a fast path)

- **Hero reactions on monster turns:** Defend (reduce one attack's damage by Armor; crits ignore it), Interpose (take an attack meant for someone within 2 spaces), Help (ally advantage), Opportunity Attack (heroes only). Each costs 1 action from the hero's next turn and is 1/round (Core p14). Interpose + Defend together is allowed.
- **The legendary's beat after every hero turn** (above).
- **Triggered monster passives** and "(Reaction, when Bloodied)" features (22 bestiary entries mention a reaction; 44 have a 1/round ability).
- **Bloodied / Last Stand** fire on damage, during a *hero's* turn.
- **Summons mid-round** (bosses that summon minions after each hero; "Get In Here! Call a Goblin Minion").

### At a glance vs one tap away

- **Glance, heroes:** done or not; actions available now *and* next turn (reactions eat them); HP and Wounds; Dying; Defended / Interposed this round.
- **Glance, monsters:** HP and armor letter; Bloodied line; minion count left; legendary's phase (normal, Bloodied, Last Stand) and the action it used last; whether it's acted this round.
- **One tap:** the full stat block, flavor and tactics (274 bestiary entries carry easier/harder tactics), conditions' text, the log.

### Tool patterns

- **Foundry Nimble:** a horizontal card strip across the top; heroes first, monsters after; drag to reorder within a side; defeated skipped; solo monsters auto-interleaved after each character; Combat System panel for group minion attacks and rolling monster actions from the canvas; hero reactions spent from the tracker with a soft confirm rather than a hard stop ([combat doc](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/combat.md)).
- **nimblerpg.app** (an Improved Initiative fork) runs "Heroes → Monsters → Combat" with Last Stand HP ([nimblerpg.app](https://nimblerpg.app/)), as the study's research board notes.
- **Ember Vault today:** side switch, tick circles, auto-switch to monsters when every hero is done, Group attack for minions, legendary choices on the name click, Bloodied and Last Stand prompts ([docs/tracker.md](../docs/tracker.md)).

### Design implications

1. **The heroes' side is a tray, not a queue.** Show the not-yet-acted heroes in seat order; a tap on any one makes them the acting hero. No forced Next order. "Done" is the main button.
2. **The acting hero is small; the targets are big.** During a hero's turn the GM's job is applying damage to monsters. The focus card holds the acting hero's name and action pips; the monster rows are the large tap targets (HP keypad with armor math, Bloodied line).
3. **Interleave the legendary beat automatically.** When a hero is marked done and a legendary is present, the focus flips to the boss's "after-hero" card: its two (or N) actions with the not-yet-used / alternate one pre-selected, dice inline, target chips, then **Back to heroes** returns to the tray. Support "all of them" vs "choose one" for legendary teams.
4. **Run the monsters' side by target, with packs.** Each step is "who attacks whom": one card per monster or pack, its action menu ("Choose 1", "Choose twice", (2×)) as buttons, roll, pick a hero. Minions: count × die, 1s dropped, one Defend for the pack.
5. **Make Defend/Interpose part of applying damage to a hero.** "11 to Kael · Defend (−3, Kael 2→1 actions next turn) · Interpose…" in the same sheet, so the per-attack pause is one tap and the hero's next-turn actions update.
6. **Let monsters move up.** A monster or group can be dragged into the heroes' side (acts after a given hero) and stays there each round (Core p15, GMG p27). A "Monsters go first" start covers surprise and Ambushers.
7. **Round end is automatic** after the last monster; the header says "Round 3 · Heroes". Show heroes' actions refilled minus reactions spent.
8. **Keyboard rapid fire** (wide view): number keys pick a monster action, Enter rolls and applies, Space/N for Done → next.

## Daggerheart

Sources: the *Daggerheart Core Rulebook* (the user's copy, "CR p." by printed page), the official [SRD 2.0](https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf) ("SRD2 p."), the [Foundryborne system wiki](https://github.com/Foundryborne/daggerheart/wiki/Combat-Flow), and Foundry module pages. The book and SRD 2.0 agree on everything below; where SRD 1.0 or the playtest differed, it's noted.

### How a fight flows

1. **No initiative, no rounds, no action count.** "Combat has no initiative order, no rounds, and no distinct number of actions you can take while in the spotlight" (CR p89). The spotlight goes where the fiction or a mechanic puts it, and players should give everyone a turn (CR p89).
2. **Who starts:** the fiction. The quick-start adventure: if the party was ambushed, the adversaries act first; if the party spotted them, the players do ([Sablewood Messengers](https://www.fantasygrounds.com/library/daggerheart/the-sablewood-messengers/the-adventure)). With Fear in the bank, the GM can "Act First: spend a Fear immediately to interrupt the PCs and spotlight an adversary to begin the fight", or "Come Out Strong" by spotlighting most adversaries on the first GM turn (CR p155).
3. **Players pass the spotlight among themselves**, making moves, **until a roll hands it to the GM.** After an action roll (CR p94, p149–150; SRD2 p47):

   | Result | Hope / Fear | Spotlight |
   |---|---|---|
   | Critical (doubles) | +1 Hope, clear 1 Stress, extra damage | stays with the players |
   | Success with Hope | +1 Hope | stays with the players |
   | Success with Fear | GM +1 Fear | **GM's turn** ("yes, but…") |
   | Failure with Hope | +1 Hope | **GM's turn** ("no, but…") |
   | Failure with Fear | GM +1 Fear | **GM's turn**, harder move ("no, and…") |

   SRD 1.0 was unclear on whether a success with Fear hands over the spotlight; the book (CR p149) and SRD 2.0 say it does ([EN World debate](https://www.enworld.org/threads/daggerheart-discussion.718730/post-9916400)). Reaction rolls make no Hope or Fear and don't hand over the spotlight (SRD2 p48).
4. **The GM may also take the spotlight** when a PC does something with consequences, offers a golden opportunity, or looks to the GM; "you can make a GM move whenever you want" (CR p149). **Spending 1 Fear interrupts** the players mid-streak, "as if the PCs had failed… or rolled with Fear" (CR p154).
5. **One GM turn** (CR p100, p154–155):
   - The GM move is free. Usually it **spotlights one adversary**, which does one thing: move within Close and make a standard attack; move within Close and use an adversary action; clear a condition; or sprint within Far or Very Far.
   - **Each extra adversary costs 1 Fear** ("spend any number of Fear to spotlight that many additional adversaries", CR p100). An adversary's **Fear Feature costs its own Fear on top** of the spotlight (CR p154).
   - **Relentless (X)** adversaries can be spotlighted up to X times per GM turn, paying Fear as usual (CR p195). This implies a normal adversary acts at most once per GM turn.
   - **Groups by feature:**
     - Minion "Group Attack": 1 Fear spotlights every same-type minion within Close for one roll with combined damage (worked example, CR p134–135, p156).
     - Leader features spotlight allies, e.g. "Tactician: mark a Stress" to spotlight 2 allies (CR p196).
     - "Into the Bramble: spend a Fear to spotlight up to 1d4 allies" (CR p200).
   - **Slow** adversaries need two spotlights: the first places a token, the second acts (CR p195).
   - The GM ends the turn by handing back: "What do you do?" (CR p100). There's no limit on moves while Fear lasts. The book's example spends 3 Fear on one GM turn: 1 for the second Bandit, then 2 for a Minion spotlight plus its Group Attack (CR p156).
6. **Ends** when the fiction resolves: adversaries defeated, flee, surrender, or the objective is met. There is no formal end step.

**Fear:**
- The GM starts with Fear equal to the number of PCs, up to 12, and **Fear carries over between sessions** (CR p154).
- **Gained** from every roll with Fear, rests and downtime, and features like Momentum ("when this adversary makes a successful attack… you gain a Fear", CR p195).
- **Spent to** interrupt, make an extra GM move (i.e. spotlight another adversary), use an adversary or environment Fear Feature, or add an adversary's Experience (CR p154).
- The book's guide to spend per scene: Minor 1–3, Standard 2–4, Major 4–8, Climactic 6–12 (CR p155).

**Hope:** each PC up to 6. Spent on Help an Ally (1), Utilize an Experience (1), a Tag Team roll (3, once per session), and Hope features (CR p90; SRD2 p49).

**Countdowns** (CR p102, p162–163):
- **Standard:** ticks on *every action roll*.
- **Dynamic:** ticks 0–3 by result. Progress countdowns tick on successes (Hope 2, crit 3); consequence countdowns tick on failures (Fear 3, Hope 2) and successes with Fear (1).
- Also: loop, increasing or decreasing, random start, and **chase countdowns** (two linked dynamic countdowns).
- Visible to players or secret. Usually only one adversary countdown per fight.

**Optional Spotlight Tracker** (CR p89): each player gets action tokens (3 recommended) and spends one per action roll or significant action. Everyone refills when all are spent. Players should let others act before spending two in a row. *This replaced the playtest's GM-side **action tracker***, where the GM spent tokens to activate adversaries and could convert tokens and Fear ([playtest text, unofficial mirror](https://daggerheart.su/rule/using-the-action-tracker-gm)). Post-beta testing dropped it for "Fear to activate more than one adversary" ([ComicBook](https://comicbook.com/gaming/news/daggerheart-testing-action-tracker-removal-in-post-beta-development/)). Foundryborne still offers action-tracker variant settings ([System Settings](https://github.com/Foundryborne/daggerheart/wiki/System-Settings)).

**At 0 HP:** a death move: Blaze of Glory, Avoid Death (unconscious; maybe a scar), or Risk It All (CR p106). A full Stress track makes a PC Vulnerable; Stress they can't mark becomes HP (SRD2 p50, p53).

### What the GM does, moment by moment

| Moment | GM sees, decides, clicks |
|---|---|
| A PC makes a move | Set the Difficulty (adversary's) or the target's Evasion; hear "14 with Hope". **Log the result**: it sets Hope or Fear, decides where the spotlight goes, and ticks countdowns. Apply damage against thresholds (mark 1, 2 or 3 HP; armor drops a tier). |
| Success with Hope | Nothing to take. Ask who's next; nudge quiet players. |
| A roll with Fear or a failure | GM turn: choose a move. Spotlight one adversary (free), then decide whether to spend Fear for more, for a Fear Feature, or for a group attack. Roll attack vs Evasion, damage vs thresholds; the PC may mark Armor. |
| Mid-streak of successes | Decide whether to spend 1 Fear to interrupt (CR p154). |
| End of the GM turn | Hand back, often to a specific player: "Kael, the brute is on you. What do you do?" |
| Any time | Countdowns tick; adversary reactions fire (Momentum, Team-Up, Heavy Hitter: CR p195), sometimes for Fear or Stress. |

**Where time goes, and the complaints:**
- **Loud players hog the spotlight.** GMs fix it by asking quiet players directly ([EN World](https://www.enworld.org/threads/starting-daggerheart-campaign-any-pitfalls.714743/page-2); [playtest review](https://solottrpg.substack.com/p/daggerheart-my-thoughts-and-ramblings)). This is what the Spotlight Tracker and the Foundry modules below try to solve.
- **Fear pacing:** some GMs take a turn on every Fear roll and overdo it; others hoard it. The book lists hoarding as a pitfall (SRD2 p86–88; [EN World](https://www.enworld.org/goto/post?id=9699509); [Runehammer: spend in bursts](https://www.runehammer.online/post/daggerheart-levers)).
- **Hidden meta-resources:** Foundry users added big Fear bars because core hid them (the study's research board).
- Adversary stat blocks in play: Relentless counts, Slow tokens, group features.

### Interruptions

- **Fear interrupt** (1 Fear, any time between player moves).
- **Adversary reactions**, regardless of who has the spotlight (CR p195).
- **PC reaction rolls** against adversary effects; Help an Ally (1 Hope) on someone else's roll; a Tag Team roll pulls a second PC into one action.
- Features that trigger "when a PC takes the spotlight" (Fear Aura, Hope & Fear supplement adversaries).

### At a glance vs one tap away

- **Glance:**
  - **who has the spotlight** (a PC, or the GM)
  - **Fear 0–12**, visible to players (CR p154)
  - each PC: Hope pips, HP and Stress slots, Armor slots, Evasion, thresholds, **times spotlighted since the last refill**, conditions
  - each adversary: Difficulty, thresholds, HP and Stress slots, "acted this GM turn" (and n/X for Relentless), Slow token, minion count
  - countdowns with their values
- **One tap:** the stat block (actions, reactions, passives, Fear Features with costs), Experiences, motives and tactics, the full countdown rule.

### Tool patterns

- **Foundryborne:** players press "Request Spotlight"; the GM grants it to anyone, requested or not; adversaries can't request. Fear shown as tokens, a bar, or hidden. Countdowns in a top-right panel (short-term, long-term, narrative), ticking manually or on events ([Combat Flow](https://github.com/Foundryborne/daggerheart/wiki/Combat-Flow), [Countdowns](https://github.com/Foundryborne/daggerheart/wiki/Countdowns)).
- **Modules:**
  - [Spotlight Counter](https://foundryvtt.com/packages/daggerheart-spotlight-counter): a count per combatant, a "round" that advances at the highest PC count, and Relentless n/X.
  - [Spotlight Carousel](https://foundryvtt.com/packages/daggerheart-spotlight-carousel): a portrait queue ordered by request time, with adversaries grouped by actor.
  - [Claim the Moment](https://foundryvtt.com/packages/claim-the-moment): timed claims; if nobody claims, the player with the fewest claims gets it.
- **Physical:** Critical Role announced a physical GM Fear tracker ([Popverse](https://www.thepopverse.com/gaming-critical-role-daggerheart-gm-fear-tracker-pax-unplugged-2025/)); tables use tokens for Hope and Fear.

### Design implications

1. **The main input is the roll result, not "Next".** One row of five buttons (Crit · Hope ✓ · Fear ✓ · Hope ✗ · Fear ✗) attached to the spotlit PC. One tap updates Hope or Fear, ticks every countdown that listens to that result, and either keeps the spotlight with the players (pick who's next) or **flips to the GM turn**. Undo reverses all of it.
2. **The player side is a fair-share picker.** The four PCs sit together, each with "spotlit ×N" pips. Tapping one makes them the focus, and the least-spotlit player is gently highlighted. The optional Spotlight Tracker (3 tokens each, refill when all are out) is a setting that turns the pips into tokens that run out.
3. **The GM turn is a budget, not a queue.** The header shows the Fear pool. The first adversary spotlight is marked "free"; each extra shows "−1 Fear" on the button. Fear Features show their cost. Group activations (Group Attack, Tactician, Move as a Unit) are one button that marks several adversaries as acted. Relentless shows n/X. Slow shows "preparing". **End GM turn** hands back, optionally to a named player.
4. **"Interrupt · 1 Fear" is always available** during the players' side, as a quiet button by the Fear pool.
5. **Countdowns sit in the economy strip** with their trigger type (every roll, dynamic progress, dynamic consequence, Fear rolls only), so logging a roll ticks the right ones.
6. **No round counter, no initiative.** Durations are "until cleared" or tied to countdowns. The study's timed conditions need Daggerheart boundaries: "when the GM turn ends", "when this PC next takes the spotlight".
7. **Naming:** Ember Vault already calls its Cmd/Ctrl+K search box "Spotlight" ([docs/spotlight.md](../docs/spotlight.md)). Daggerheart's spotlight in the tracker will collide with it in docs, commands and settings; pick wording up front (e.g. keep "spotlight" for Daggerheart and refer to the search box by its command name).

## 5e (2024 and 2014)

Sources: D&D Beyond's [2024 Free Rules](https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game) and [Rules Glossary](https://www.dndbeyond.com/sources/dnd/free-rules/rules-glossary), the [2014 Basic Rules: Combat](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat) and [Monsters](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters), the [2024 stat block preview](https://www.dndbeyond.com/posts/1890-preview-the-new-stat-block-design-in-the-2024), and the plugin's [docs/5e.md](../docs/5e.md). The 2024 legendary wording is from secondary quotes; check it against the SRD 5.2 text in `src/systems/dnd5e/data/` before building.

### Turn structure

1. **Surprise.**
   - **2014:** decide surprise first. A surprised creature can't move or act on its first turn and can't react until that turn ends ([2014 Combat](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat)).
   - **2024:** surprise only means Disadvantage on the Initiative roll. Surprised creatures act and react normally ([2024 Free Rules](https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game)).
2. **Initiative.** Everyone rolls d20 + Dex (2024 stat blocks print the Initiative modifier). Identical monsters share one roll in both editions: "each member of the group has the same Initiative" ([2024](https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game)). Ties: the DM orders monsters, the players order characters, and the DM breaks monster-versus-PC ties.
3. **A turn.**
   - **Start:** a death save if at 0 HP ([2014](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat); 2024 the same, and a natural 20 regains 1 HP). Recharge rolls ("at the start of each of the monster's turns, roll a d6", [2014 Monsters](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters)). Legendary uses come back. The reaction resets.
   - **During:** movement up to Speed (it can be split), one action, a bonus action if a feature grants one, and one free object interaction (2014).
   - **End:** saves at "the end of each of its turns", which the effect's own text sets; there is no general rule.
4. **Between other creatures' turns: legendary actions.**
   - **2014:** one option "only at the end of another creature's turn". Uses come back at the start of the monster's own turn ([2014 Monsters](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters)).
   - **2024:** "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature's turn…" Every option costs one use. In a lair, monsters get an extra use and an extra Legendary Resistance instead of separate lair actions ([DDB preview](https://www.dndbeyond.com/posts/1890-preview-the-new-stat-block-design-in-the-2024)).
5. **Lair actions (2014 only):** at initiative count 20, losing ties ([2014 Monsters](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters)).
6. **Round end:** after the lowest initiative. There is no round-end step in the rules; effects key to turns.
7. **Combat ends** when one side is down, flees or surrenders.

### What the GM does, moment by moment

| Moment | GM sees, decides, clicks | Where time goes |
|---|---|---|
| Start | Roll monsters' initiative (grouped), collect the players' rolls, sort, settle ties | Typing player rolls; tie order |
| A PC's turn | Apply damage to monsters, saves, concentration checks on the PC's spells | Finding the target; resistances; concentration DC (10 or half the damage, max 30 in 2024) |
| After the PC's turn | **Legendary action?** Spend a use, pick an option, roll | Forgotten; DMs are told to put markers for it in the tracker ([Dungeon Solvers](https://www.dungeonsolvers.com/legendary-actions-and-lair-actions)) |
| Count 20 (2014) | Lair action; dragons can't repeat an effect two rounds running (stat block text) | Forgotten since 2020 per DDB feedback (see the study's research board) |
| A monster's turn | Recharge roll, then a stat-block read: Multiattack, choose targets, roll, PCs' reactions (Shield, Counterspell, opportunity attacks) | Stat blocks; a PC's reaction pausing the turn |
| A grouped monster's turn | "Each member acts at the same time" ([2014](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat)): play the goblins one after another, or use mob rules (2014 DMG p250 table of attackers per hit, [secondary](https://my.flowershow.app/@Iwuaa/dnd-compendium/rules/mechanics/handling-mobs)) | Rolling eight attacks |

Speed-ups DMs use: initiative visible to players, static average damage, fewer monster types, groups run as one ([Sly Flourish](https://slyflourish.com/tips_to_speed_up_combat.html)). Popcorn initiative ([Angry GM](https://theangrygm.com/popcorn-initia)) is popular but blurs start- and end-of-turn effects ([EN World](https://www.enworld.org/threads/failed-house-rules.667266/)). The 2014 DMG's side initiative and speed factor were dropped from the 2024 DMG ([Wargamer](https://www.wargamer.com/dnd/axed-optional-rules), secondary).

**Delay is not a 5e rule** in either edition. The 2024 text suggests Dodge or Ready "to delay acting" ([Free Rules](https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game)). Moving someone later by dragging is a house rule; allow it without naming it Delay.

### Interruptions

- **Legendary actions** after *any* other creature's turn, including other monsters'.
- **Reactions:** opportunity attacks (2014: a hostile creature leaves your reach; 2024: any creature), Shield, Counterspell, Hellish Rebuke, readied actions. A Ready spell needs concentration (2014). In 2024 the interrupted creature "can continue its turn right after the Reaction". One reaction until the start of your next turn.
- **Concentration saves** whenever a concentrating creature takes damage, one per source.
- **Lair actions** (2014) at count 20.

### At a glance vs one tap away

- **Glance:** initiative, name, AC, HP (with temp), reaction used, legendary uses left, concentrating, conditions with rounds left, death saves (3 and 3), Recharge state ("Fire Breath 5–6, ready / spent").
- **One tap:** the stat block, Legendary Resistance per day, spell slots, the log.

### Tool patterns

- **Shieldmaiden:** reminders on events (concentration on damage, start-of-turn effects), multi-target damage, a damage log with undo, a player screen ([Shieldmaiden](https://shieldmaiden.app/tools/combat-tracker)).
- **Improved Initiative:** dense list plus the active stat block, keyboard-driven; tags expire at the start or end of a named creature's turn.
- **D&D Beyond:** complaints about no reordering, no conditions, forgotten lair actions (the study's research board).
- **Foundry dnd5e:** grouped identical monsters with a count.
- **Ember Vault today:** drag to reorder, legendary action and Legendary Resistance pips, Up now, Back and Next ([docs/5e.md](../docs/5e.md)).

### Design implications

1. **Moments in the queue.** A "Lair · 20" row (2014) and an "after this turn" legendary prompt are part of the order, not reminders. The legendary prompt appears after *every* turn while uses remain. It's dismissed with one tap and never blocks Next.
2. **Recharge and death saves are start-of-turn prompts** on the focus card ("Fire Breath: roll 5–6 · ready"; "Death save · ✓✓ ✗").
3. **Reaction pip per creature** clears at that creature's turn start. Tapping it from the queue logs a reaction without changing whose turn it is.
4. **Grouped monsters as one row with members.** One initiative; the focus card steps through the members ("Goblin 2 of 4"), or offers a mob roll. A group can be split.
5. **Edition switch** in the fight's settings: surprise (skip the first turn vs disadvantage), lair row vs "in lair" pool maximum, 1-use legendary options (2024).
6. **Concentration prompt on damage** inside the HP keypad ("Con save DC 11"), as the study already sketches.

## Pathfinder 2e (Remaster)

Sources: Archives of Nethys Remaster rules pages (Player Core / GM Core), the user's *Core Rulebook* (2nd printing, pre-Remaster; "CRB p.", where it agrees), the [foundryvtt/pf2e](https://github.com/foundryvtt/pf2e) source and wiki, and module pages.

### Turn structure

1. **Roll initiative.** Usually Perception. The GM can call for Stealth if you were Avoiding Notice, or Deception or Diplomacy in a social scene. The GM rolls for non-PCs, once for a group of identical creatures or individually ("this can make battles less predictable and more dangerous", CRB p468; [AoN](https://2e.aonprd.com/Rules.aspx?ID=2423)). **Ties: the adversary goes first;** tied PCs choose their own order.
2. **No surprise round.** Stealth used for initiative is compared to each enemy's Perception DC, and the sneaker starts undetected by those it beats ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2541)).
3. **Start of turn** (any order, then the last step; [AoN](https://2e.aonprd.com/Rules.aspx?ID=2428), CRB p468–469):
   - durations of effects *you created* drop by 1
   - one "your turn begins" free action or reaction
   - **if dying, a recovery check** (flat DC 10 + dying)
   - fast healing, regeneration
   - **last: regain 3 actions and 1 reaction**, adjusted by slowed X, stunned X (stunned overrides slowed) and quickened (+1, usually restricted). An unused reaction from last turn is lost.
4. **Act:** single actions and 2- or 3-action activities, which must fit in the turn. The multiple attack penalty is −5 / −10 (agile −4 / −8). It counts every action with the attack trait and resets each turn ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2289)).
5. **End of turn** ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2430), CRB p469):
   - effects "until the end of your turn" end, and **unsustained spells end**
   - durations enemies put on you drop by 1
   - **persistent damage, then its DC 15 flat check**, then saves against afflictions
   - only then do conditions like **frightened drop by 1**
   - "your turn ends" triggers
6. **Round:** from the highest initiative's turn to the end of the lowest's. Initiative is not re-rolled ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2425)).
7. **The order changes** through:
   - **Delay:** a free action as your turn begins. You leave the order and come back after *any* creature's turn, permanently at the new spot. You have no reactions while delayed. Your harmful start- and end-of-turn effects happen *immediately* when you Delay. A whole round delayed loses the turn ([AoN](https://2e.aonprd.com/Actions.aspx?ID=2294); CRB p470).
   - **Knocked out:** a PC moves to directly before the turn in which they dropped ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2319); CRB p459).
   - **Ready** does *not* move you: 2 actions, a trigger, then the action as a reaction before your next turn, at the multiple attack penalty you had when you Readied ([AoN](https://2e.aonprd.com/Actions.aspx?ID=2299); CRB p469).
8. **End:** foes defeated, a truce, or a change in circumstances; back to exploration ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2426)).

**Dying:**
- Dropping to 0 HP gives dying 1 (2 on a crit), **plus wounded**. Damage while dying adds 1 (2 on a crit). Dying 4 kills, or lower with doomed X.
- Losing dying gives wounded +1.
- Heroic Recovery spends all Hero Points to stabilise ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2319), [Dying](https://2e.aonprd.com/Conditions.aspx?ID=69)).

### What the GM does, moment by moment

- **Every monster turn:** apply start-of-turn changes (stunned, slowed), spend 3 actions with the penalty rising, track which reactions the party has spent, then end-of-turn bookkeeping.
- **Every PC turn:** apply damage, and answer "is it off-guard?" (circumstance −2 AC). Watch for **monster reactions** the PC's action might trigger: Reactive Strike on a move, manipulate or ranged action ([AoN](https://2e.aonprd.com/MonsterAbilities.aspx?ID=3)). Shield Block, and the monster's own unique reaction.
- **Where time goes:**
  - remembering frightened decay and wounded→dying, the classic misses ([EN World](https://www.enworld.org/goto/post?id=9188279))
  - persistent damage timing
  - Sustain
  - whether a monster has a reaction and has used it
  - the penalty count mid-turn

GM Core itself advises leaving reactions off clumsy or mindless creatures and large groups to keep play moving, and telegraphing the ones that exist ([AoN](https://2e.aonprd.com/Rules.aspx?ID=2912)). The CRB suggests tracking order with "a simple list, a series of cards… or a Pathfinder Combat Pad" that can be rearranged (CRB p469).

### Interruptions

- **Reactions on other turns:** Reactive Strike (fighters, many monsters), Shield Block (some feats give a second, Shield-Block-only reaction), champion reactions, readied actions, monster reactions keyed to triggers.
- **Delay returns** after any creature's turn.
- **KO reorders** the queue mid-turn.
- **Damage to the dying** (+1 or +2).

### At a glance vs one tap away

- **Glance:**
  - HP / max, temp HP
  - AC with off-guard folded in
  - action pips (3 ± slowed, stunned, quickened; used)
  - reaction available or spent
  - attacks this turn (−0 / −5 / −10)
  - valued conditions as tags (Frightened 2, Dying 2, Wounded 1, Doomed 1)
  - persistent damage with its dice and type
  - the threat level in the header
- **One tap:** saves, Perception DC, the reaction's trigger text, who created each effect, the full condition text.

### Tool patterns

- **Foundry pf2e (core):** initiative skill per combatant from a dropdown; enemies win ties; persistent damage rolled to chat at end of turn with the flat check as a button; durations expire on turn events. Core does **not** decrement frightened and has **no Delay button** ([source](https://github.com/foundryvtt/pf2e); [GM's Starter Guide](https://github.com/foundryvtt/pf2e/wiki/GM's-Starter-Guide)).
- **What modules add**, which shows where the gaps are:
  - [PF2e Workbench](https://github.com/xdy/xdy-pf2e-workbench): auto-reduce frightened at end of turn and stunned at start; warn when a turn starts with other than 3 actions; dying, wounded and unconscious automation; move a 0-HP combatant before the current turn.
  - [PF2e Automated Action Tracker](https://foundryvtt.com/packages/pf2e-auto-action-tracker): action and reaction pips in the tracker, slowed and stunned, a Sustain reminder, undo.
  - [PF2e Reaction Checker](https://foundryvtt.com/packages/pf2e-reaction/): notifies when someone *can* react.
  - [PF2e Utility Buttons](https://foundryvtt.com/packages/pf2e-flatcheck-helper): Delay and Return.
- **[pf2calc's tracker](https://pf2calc.pages.dev/initiative):** all conditions with values; End Turn decrements frightened.

### Design implications

1. **The focus card is a three-action meter.** Big pips that change with slowed and stunned, a reaction pip, and a penalty counter that ticks with each attack (−0 → −5 → −10). The study's "row opens in place" design fits: the order never jumps.
2. **Turn boundaries run the bookkeeping in the book's order** and show it in one prompt sheet:
   - start: durations you created, a recovery check (DC shown), actions regained
   - end: Sustain? → persistent damage roll → DC 15 flat check (DC 10 assisted) → frightened −1
3. **Reactions are first-class on every row:** a pip per creature (two where a feat gives an extra). A one-tap "react" from the queue logs it during someone else's turn. Monsters with a reaction show its trigger as a short line, so the GM knows *when* to react.
4. **Delay is a real state:** the entry leaves the queue into a "Delayed" tray. Its harmful start- and end-of-turn effects resolve on the spot. A "Return now" button appears after every turn. A full round delayed loses the turn.
5. **KO reorder is automatic:** a PC dropped to 0 moves before the current turn, gets dying 1 or 2 + wounded, and their next turn opens with the recovery check.
6. **Each effect stores who created it**, because durations tick on the creator's start or the target's end.
7. **Groups:** individual rows by default, with an optional shared initiative. Troops are one row with segment thresholds at 2/3 and 1/3 HP ([AoN](https://2e.aonprd.com/Rules.aspx?ID=3364)).

## Call of Cthulhu 7e

Sources: the *Keeper Rulebook* (the user's copy, "KR p."), Chaosium's rules wiki ([combat](https://cocwiki.chaosium.com/rules/combat.html), [hit points](https://cocwiki.chaosium.com/rules/hit-points-wounds-and-healing.html), [sanity](https://cocwiki.chaosium.com/rules/sanity.html)), and the CoC7 Foundry system's docs ([combat](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/blob/main/docs/en/combat.md), [chases](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/blob/main/docs/en/chases.md)).

### Turn structure

1. **Something starts it.** If both sides square up, start a combat round. A sudden attack can be a **surprise**: the target may roll Listen, Spot Hidden or Psychology, with the attacker's Stealth setting the difficulty. If they anticipate it, they may dodge or fight back. If not, the Keeper may make the attack an automatic success or give it a bonus die. The surprise is resolved *before* DEX order, so the attacker doesn't end up acting last (KR p106).
2. **Order of attack:** DEX, highest first. Ties go to the side with the higher combat skill (KR p102). **Readied firearms shoot at DEX + 50** (KR p112). Optional rule: a DEX roll for initiative, ordered by level of success, Extreme first (KR p123).
3. **One action per turn:** attack (Fighting or Firearms), a fighting manoeuvre, flee, cast a spell, or something else that takes time. Monsters with several attacks make them all on their turn (KR p102).
4. **Delay is allowed:** a character may wait until another has acted. If two wait on each other, the higher DEX goes first, or the round may end with neither acting (KR p102).
5. **Defending happens on the attacker's turn.** The target chooses **Dodge** (ties go to the dodger) or **Fight Back** (ties go to the attacker; win and you deal damage). It's an opposed roll by level of success (KR p103). Fighting back can't do an Extreme "outstanding" blow; that "only occurs if the attack is made on a character's turn… each character gets one moment in the spotlight each round" (KR p103). **Outnumbered:** once a character has dodged or fought back this round, later melee attacks on them get a bonus die; a creature with N attacks can defend N times first (KR p108).
6. **Firearms can't be dodged or fought back.** The target may **dive for cover** (a Dodge roll gives the shooter a penalty die) but **forfeits their next action** (KR p113, example p118). Aiming spends this turn for a bonus die on the same DEX slot next round (KR p113).
7. **Round ends** when everyone willing and able has acted. "An investigator's equality of opportunity is much more important than… a precise amount of real-world time" (KR p102). Dying characters roll CON **at the end of each round** (KR p120).
8. **Combat ends** when one side is down, flees or gives up. Keepers end it once the goal is met rather than grinding ([Roleplayer's Guild](https://theroleplayersguild.com/articles/coc-7e/combat-chases)).

**Wounds and Sanity mid-fight.**
- **Major wound:** a single blow of half max HP or more. Tick the box, fall prone, and make a CON roll or fall unconscious. A blow of more than max HP kills (KR p119–120).
- **0 HP:** with a major wound you're **dying** (CON at the end of every round; only First Aid stabilises, then Medicine). Without one you're unconscious (KR p120).
- **Sanity checks** come when a horror appears, usually for every investigator who sees it at once. A loss of 5 or more from one roll means an INT roll: on a success they're temporarily insane and in a **bout of madness**, which lasts 1D10 combat rounds when played out (KR p155–156). On a failed Sanity roll the Keeper briefly controls the investigator's next action ([wiki](https://cocwiki.chaosium.com/rules/sanity.html)).
- **Luck spending** is an optional rule (KR p99); many Keepers bar it in combat ([morganhua](https://morganhua.blogspot.com/2022/08/call-of-cthulhu-7th-edition-luck.html)).

**Chases** are a separate subsystem built on the same clock.
- A speed roll (CON on foot, Drive Auto in a car) adjusts MOV. Faster prey escapes and nothing is played out; otherwise "cut to the chase" with the pursuer two locations behind (KR p132–133).
- Then rounds in DEX order, with **movement actions** of 1 + (MOV − the slowest MOV), on a track of locations with hazards and barriers.
- "A combat round and a chase round are interchangeable" (KR p133), so a fight can become a chase and back. The book suggests tracking it as dots on paper (KR p133).
- Keepers call chases cinematic when prepped and fiddly otherwise ([morganhua](https://morganhua.blogspot.com/2023/10/call-of-cthulhu-thoughts-on-chases.html); [BRP Central](https://basicroleplaying.org/topic/8607-my-problems-with-the-chase-rules/)).

### What the Keeper does, moment by moment

- **Before the order:** decide whether this is a surprise attack; ask "who has a gun out?" (+50).
- **Each turn:** ask "what is your investigator doing?", name the skill, roll. In melee, the defender immediately picks Dodge or Fight Back, so the Keeper needs **the defender's** Dodge and Fighting values (Regular / Hard / Extreme) as fast as the attacker's.
- **Fiction first:** the book insists on describing intent before naming rolls, and warns against "repeatedly roll[ing] dice without any story" (KR p102). The tracker should stay quiet.
- **Round end:** CON rolls for the dying; bouts of madness count down; dive-for-cover penalties clear.
- **Where time goes:** looking up Regular/Hard/Extreme values; remembering who already defended this round (Outnumbered); who dove for cover; readied guns re-sorting the order; group Sanity rolls.

### Interruptions

- **Dodge / Fight Back / Dive for cover:** an opposed roll by the *target*, inside the attacker's turn. It's the main interruption, and it happens on nearly every attack.
- **Sanity rolls** for several investigators at once, triggered by what appears.
- **Readied gun drawn:** the order changes for the next round.
- **Major wound CON roll** on the hit itself.

### At a glance vs one tap away

- **Glance:** DEX slot (and +50), HP Max | Current with the Major wound / Dying / Unconscious boxes, Sanity current, "defended this round", "dove for cover (skips next)", "aiming".
- **One tap:** skills as Regular | Half | Fifth (Fighting, Firearms, Dodge first), weapons, Luck, the monster's full block.

### Tool patterns

- **Foundry CoC7:** DEX initiative and a draw-the-gun toggle that adds 50; an optional rolled initiative (success level, DEX tiebreak, a bonus die instead of +50). Fighting manoeuvres are "not implemented yet". Chases are a separate item with a location track, barriers with HP, hazards with checks and movement costs, and prey or chaser per participant ([combat](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/blob/main/docs/en/combat.md), [chases](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/blob/main/docs/en/chases.md)).
- **Keepers' habits:** theatre of the mind; HP tracked only for tougher foes ([BRP Central](https://basicroleplaying.org/topic/20917-movement-combat/)); strict turn order because fights are lethal ([Yog-Sothoth wiki](https://yogwiki.cthulhueternal.com/wiki/Keeper_Advice:Dealing_with_fights)).

### Design implications

1. **Defence is a prompt on the attack, not a turn.** When the acting entry attacks someone in melee, offer "Dodge 45 / Fight Back 50" for the target with its three values, plus the Outnumbered bonus-die note if they've already defended this round. For a gun: "Dive for cover" (marks "skips next action").
2. **A drawn-gun toggle per entry** re-sorts the next round, not the current one; show the +50 in the DEX column.
3. **Round-end prompts:** CON for the dying; madness rounds left.
4. **Group Sanity prompt:** one sheet, every investigator who sees it, x/y loss, INT roll on 5+.
5. **Chases: support the clock, not the map.** Reuse the DEX order and rounds; add a simple location line (dots) with prey/chaser and movement actions left as an optional panel in the wide view. Leave hazards and barriers as notes. A full chase tool can wait.
6. **Quiet by default.** The page design in the study fits: no timers or flashing; colour only for wounds and Sanity.

## What core needs, across the five

- **Three turn models, not one.** A *queue* (5e, PF2e, CoC: ordered, with Delay or Hold moving entries), *sides* (Nimble: a tray of heroes in any order, then groups of monsters, with legendary beats between heroes), and a *spotlight* (Daggerheart: no order, a GM turn with a Fear budget). The study's `TurnState` already splits these. Each needs its own "boundary" events for timed conditions: turn start and end; side start and end; spotlight passes, GM turn ends.
- **Moments in the flow:** non-creature entries the queue or sides can hold. Lair at 20; legendary "after this turn"; Nimble's after-hero boss beat; CoC's end-of-round CON rolls; PF2e's start- and end-of-turn steps; Daggerheart countdowns ticking on rolls.
- **A reaction model:** a per-creature "reaction available" pip that resets at the game's point (5e and PF2e at the creature's turn start; Nimble heroes 1/round per reaction, costing an action from the next turn; CoC "defended this round" for Outnumbered). It needs a one-tap "log a reaction" from any row during anyone's turn.
- **The defender's choice in the damage sheet:** Nimble Defend / Interpose, Daggerheart Armor slot, 5e Shield, PF2e Shield Block, CoC Dodge / Fight Back / Dive for cover. This is the per-attack pause in every game; the keypad should offer it for the *target*.
- **Actions on the focus card:** the acting creature's stat-block actions as buttons with their dice: Nimble's "Choose 1 / twice", 5e Multiattack and Recharge, PF2e's three-action meter and penalty, a Daggerheart adversary's standard attack and Fear Features with costs.
- **Groups:** one entry, several members. Nimble packs and minions, 5e grouped initiative, Daggerheart minion Group Attack and leader activations, PF2e troops. Split and merge on the fly.
- **Effect provenance:** who created an effect (PF2e durations tick on the creator's turn start or the target's turn end), and who caused it (already in core's timed conditions).

## Running a fight full width (main tab) and in the sidebar

### What existing tools do with a wide canvas

- **Foundry core:** a sidebar list you can pop out into a draggable, resizable window. It has Next/Previous turn and round, End Turn for players, Hidden and Defeated toggles, and one tracked resource ([Foundry: Combat](https://foundryvtt.com/article/combat/)). People installed [Popout Resizer](https://foundryvtt.com/packages/popout-resizer) and [Resize Sidebar](https://www.foundryvtt-hub.com/package/resize-sidebar/) just to make it wider.
- **Carousel Combat Tracker** (package `combat-tracker-dock`, formerly Combat Tracker Dock) puts a **horizontal portrait ribbon** across the top, docked or floating, or vertical ([package](https://foundryvtt.com/packages/combat-tracker-dock); [settings source](https://raw.githubusercontent.com/theripper93/combat-tracker-dock/master/scripts/settings.js)):
  - portraits 30–180px, with "shrink portraits" instead of scrolling when there are many
  - centred carousel or fixed slots
  - HP as text or bars over the portrait
  - "Hide until first turn", hidden enemy initiative
  - Shift+N / Shift+M for turns
  - Complaints: lag, collisions with other top UI, a request for grouped initiative ([issues](https://github.com/theripper93/combat-tracker-dock/issues)). Tables cast it to a TV "like Baldur's Gate 3" and keep HP on the GM's side (Reddit snippet; the page was blocked).
- **Monk's Combat Details:** pops the tracker out at combat start and closes it at the end, scrolls to the current combatant, announces who's up *and who's next*, and auto-defeats at 0 HP ([hub](https://www.foundryvtt-hub.com/package/monks-combat-details)).
- **Combat Focus:** docks chat under the tracker with a draggable split, and warns it's poor on small screens ([package](https://foundryvtt.com/packages/foundry-combat-focus)).
- **Owlbear Rodeo:** trackers are **popovers**, not docked bars. [Clash!](https://extensions.owlbear.rodeo/clash) has optional columns (fewer columns, smaller window), "-15" quick math, and names turning yellow then red as HP drops. [GM's Grimoire](https://extensions.owlbear.rodeo/hp-tracker) adds multi-select damage, a "Battle Focus" mode that shrinks to the fight controls, and a **Player Preview**. [Battle Board](https://github.com/MissingLinkDev/battle-board) has groups that advance on one Next and staged reinforcement groups.
- **Shieldmaiden:**
  - **GM:** a top bar with current, next and a timer, plus a **"go live" broadcast toggle**; a side panel for log, damage meters and requests; multi-target damage with half on a save; undo from the log ([tracker](https://shieldmaiden.app/tools/combat-tracker); [source](https://github.com/HarmlessKey/Shieldmaiden/tree/main/src/components/combat)).
  - **Its DM-screen layout spec:** three resizable columns (25/45/30%) on wide screens, sizes saved as clamped percentages, tabs on phones ([spec](https://raw.githubusercontent.com/HarmlessKey/Shieldmaiden/main/openspec/specs/dm-screen-layout/spec.md)).
  - **Public list "for a separate screen":** health per side as Hidden, Obscured or Shown ([settings source](https://raw.githubusercontent.com/HarmlessKey/Shieldmaiden/main/src/components/settings/TrackEncounter.vue)).
- **Improved Initiative:**
  - **Keyboard-first:** n / alt+n turn, j/k select, t damage, l heal, g tag, h hide, r reaction, alt+w player view ([keybindings](https://raw.githubusercontent.com/cynicaloptimist/improved-initiative/master/client/Commands/DefaultKeybindings.ts)).
  - **Player view:** HP as actual, coloured label, monochrome label, damage taken, or hidden; **active combatant on top**; splash portraits; a round counter; a turn timer ([settings](https://raw.githubusercontent.com/cynicaloptimist/improved-initiative/master/common/PlayerViewSettings.ts)).
- **D&D Beyond:** the Encounters tracker is "too large… hard to get an overview" ([feedback](https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/147289-feedback-combat-tracker)). Maps puts initiative down the left, players see the order, and users asked for A/B labels and a visible round ([feedback](https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/209715-new-maps-encounters-feedback-thread?comment=42)).
- **Obsidian's Initiative Tracker (javalent):**
  - The tracker is in the right sidebar and the builder in a main tab; its **Player View** is a separate view ([main.ts](https://raw.githubusercontent.com/javalent/initiative-tracker/main/src/main.ts)).
  - Open since 2023: a player view **popped out to a second monitor doesn't update unless focused** ([#99](https://github.com/javalent/initiative-tracker/issues/99)); player-view text too small on big screens ([#90](https://github.com/javalent/initiative-tracker/issues/90)).
- **Daggerheart tools:**
  - Foundryborne puts countdowns in a corner panel ([wiki](https://github.com/Foundryborne/daggerheart/wiki/Countdowns)).
  - Spotlight Carousel queues portraits by request time ([package](https://foundryvtt.com/packages/daggerheart-spotlight-carousel)).
  - Demiplane's Daggerheart GM screen was still "coming soon" ([forum](https://forums.demiplane.com/t/daggerheart-gm-screens-encounter-building/4817)).
- **Nimble's own Foundry tracker** is a card strip across the top, heroes then monsters ([combat doc](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/documentation/gm/combat.md#the-combat-tracker)).

### Patterns

| Pattern | Seen in | Good for | Weak at |
|---|---|---|---|
| **Turn ribbon over a focus area** (now · on deck · the rest; round chip at the start) | Carousel, Nimble Foundry, BG3-style TV casts | Initiative games (5e, PF2e, CoC); a shared TV | Spotlight games (no order to show); many combatants (portraits shrink) |
| **Multi-column: queue, focus card, stat block or log** | Shieldmaiden, Improved Initiative, Combat Focus | Laptops and desktops; the GM screen | Portrait tablets |
| **Grid of combatant cards** | Study's Daggerheart "table"; Foundry Nimble at width | Sides and spotlight (Nimble, Daggerheart): everyone visible, tap anyone | Showing order |
| **Popover / compact mode** | Owlbear, GM's Grimoire "Battle Focus" | Small spaces | Overview |
| **Separate player view** | Improved Initiative, Shieldmaiden, javalent | TV / second screen | Staying in sync (javalent #99) |

**Calling "on deck"** (naming who's next along with who's up) is a standing GM habit ([Roll20 compendium](https://app.roll20.net/compendium/dnd5e/Rules:Running%20Combat); [EN World](https://www.enworld.org/threads/rpg-evolution-taking-the-initiative.718166/post-9886696)) and the one piece of every player view.

**Tablets:**
- No tool documents a portrait-versus-landscape layout. Shieldmaiden falls back to tabs below a breakpoint; Foundry's touch support pushes people to companion apps.
- In Obsidian, side panels on phones and tablets are drawers that slide over the note rather than columns beside it (my understanding of Obsidian mobile; check on an iPad), and popout windows are desktop-only. On an iPad the main tab is where a big fight has to live; the sidebar is a quick glance.

### Design implications

**One component, three widths.** The sidebar (360px) and the main tab are the same view type rendering the same encounter store, at different breakpoints, not two implementations. Obsidian lets one `ItemView` type open in a sidebar leaf or a main-area tab (the plugin already opens views both ways: `getRightLeaf` in `src/systems/dnd5e/runtime.ts`, `getLeaf('tab')` for the compendium). Every mutation already goes through the store and fires `changed` (CLAUDE_CODE_GUIDE.md), so a second open view stays in sync for free. Push state; never refresh on focus (javalent #99).

| Width | Layout |
|---|---|
| < 480 (sidebar, phone) | Today's study: header, economy strip, focus card, list, pinned footer. |
| 480–900 (half screen, portrait tablet) | Focus card and list side by side, or the ribbon over a taller focus card; the footer becomes the focus card's own buttons. |
| ≥ 900 (laptop, landscape tablet, desktop) | **Ribbon or table on top, then three columns:** the game's queue or tray; the **focus card** (bigger, with the stat block's actions inline as buttons); the stat block, log or prompts. Pane sizes saved per vault, clamped. |

**Per game, what goes on top of the wide view:**
- **5e, PF2e, CoC:** a turn ribbon with now (large), on deck, and the rest. Lair at 20 and legendary "after" markers are ribbon items too. CoC's ribbon shows DEX with the +50 badge; PF2e's shows action pips and the reaction under each portrait.
- **Nimble:** two blocks instead of a ribbon. On the left, the heroes' tray in seat order with done ticks; on the right, the monster groups. The legendary boss gets a **permanent pane** in the wide view, because it acts after every hero.
- **Daggerheart:** no ribbon. A **table**: the party as a row of cards with spotlight counts, adversaries as a grid below, and Fear and countdowns as a band across the top. The spotlit card is the focus.

**Rapid fire on a keyboard** (wide view; Improved Initiative's set is the model):
- `N` / `Shift+N`: next / back (Nimble: done; Daggerheart: end GM turn)
- `J` / `K` and arrows: select
- `D` / `H`: damage / heal the selected target, opening the keypad
- `1`–`9`: pick an action on the focus card
- `R`: log a reaction for the selected creature
- `Z`: undo
- Show the keys on hover or in a hint row, and let them be switched off. Obsidian commands get hotkeys from the user; the in-view keys need a focus rule so they don't fire while typing in a note.

**Sidebar and main tab together.** The useful pairing is **main tab for running, sidebar for the GM's glance while reading notes**. When the encounter is open in a main tab, the sidebar view collapses to a "now / next / round" strip plus HP for the focus. Both follow the same selection: selecting a creature in one scrolls the other to it.

**Player-facing view** (if the user wants one; see the questions):
- A separate, control-free view type that can open in a popout window (desktop) for a TV or second monitor, with large zoomable type.
- It shows round, now and on deck, and the order or sides; Daggerheart shows who has the spotlight and the Fear pool, since the book says to keep Fear visible (CR p154).
- Health per side as exact, label (Bloodied, Last Stand, "Critical"), or hidden.
- Hidden combatants stay hidden; optionally "hide until first turn".
- A **"go live"** toggle so the GM can set up without broadcasting.

## Questions for you

Only you can settle these. Each has a recommendation.

1. **Nimble, the heroes' side: what should the big card show?** The GM mostly listens and applies damage while a hero acts.
   - (a) The acting hero (name, actions, HP), large, with monsters as a list below.
   - (b) A slim acting-hero strip, with the **monsters as large tap targets** for damage.
   - (c) The boss, permanently, when there is one.
   - *Recommendation:* (b) in the sidebar, and (b) plus (c) in the wide view, where the boss gets its own pane.
2. **Nimble, the monsters' side: how do you run it?**
   - (a) One monster at a time, in a fixed order.
   - (b) **By target**: each step is "who attacks whom", packs and minions together, as the GM's Guide suggests.
   - (c) All at once: you narrate and just apply damage.
   - *Recommendation:* (b), with (a) as what happens when there are no packs.
   - Also: do your players actually Defend and Interpose often enough that the damage sheet should ask every time?
3. **Daggerheart: which spotlight aids do you use?**
   - (a) None: free spotlight, with the tracker only counting how often each player has had it.
   - (b) The book's optional **Spotlight Tracker** (3 action tokens per player, refill when all are out).
   - (c) The playtest's GM **action tracker** (it's gone from the final rules, though Foundryborne still offers it).
   - *Recommendation:* (a) by default, with (b) as a setting; skip (c).
4. **Daggerheart: will you log every roll in the tracker?**
   - (a) Yes: five result buttons (Crit, Hope ✓, Fear ✓, Hope ✗, Fear ✗) that move Hope, Fear, the spotlight and countdowns in one tap.
   - (b) Only Fear: a plus and minus on the pool, with the spotlight passed by hand.
   - *Recommendation:* (a), with (b) always available for rolls made off-screen.
5. **What do players see?**
   - (a) Nothing: a GM-only screen.
   - (b) A **player view** in a popout window on a TV or second monitor (desktop only).
   - (c) You turn the laptop or iPad round now and then.
   - If (b): monster HP as exact, a label (Bloodied, Last Stand) or hidden?
   - *Recommendation:* design the main tab as the GM's screen first, and add (b) as a separate control-free view with labels for monster health.
6. **What's on the table during a fight?**
   - (a) A laptop (landscape, keyboard).
   - (b) An iPad in landscape.
   - (c) An iPad in portrait, or a phone.
   - (d) A desktop with a second monitor.
   - This decides which wide layout is designed first, and whether keyboard shortcuts matter.
   - *Recommendation:* design for (a) and (b) first: three columns at 900px and up, two at 480–900.
7. **Which games do you run yourself, and with which rules?** For example: 5e 2014 or 2024, lair actions, grouped initiative, popcorn initiative, Nimble's published GMG or the 3.x drafts (Last Stand as "X more damage" or "regains HP per hero"; 1/round reactions resetting at the start or end of your turn), CoC chases.
   - *Recommendation:* go deepest on the games you run. Support CoC chases only as the shared DEX clock plus an optional location line, and keep PF2e's turn-boundary automation behind a setting.
8. **Naming:** Ember Vault's Cmd/Ctrl+K search box is already called **Spotlight**. In a Daggerheart fight, "spotlight" means something else.
   - (a) Keep both.
   - (b) Rename the search box in docs and settings, e.g. "Quick search".
   - (c) Call Daggerheart's the "turn" in the tracker.
   - *Recommendation:* (b) or (a). Daggerheart players expect "spotlight", so don't rename the game's word.
