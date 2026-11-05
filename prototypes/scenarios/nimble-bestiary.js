// Nimble monsters transcribed from the Nimble GM Guide 3.0 and Monsters & More v0.1 (draft).
// Included with permission from Nimble's creator, with attribution: Nimble TTRPG © Nimble Co.
// Please support the game by buying the official books at https://nimbleRPG.com
window.NIMBLE_BESTIARY = {
 "goblin": {
  "name": "Goblin",
  "source": "GMG p.30",
  "level": 0.5,
  "size": "Small",
  "type": "Goblin",
  "role": "regular",
  "armor": "none",
  "hp": 15,
  "speed": 6,
  "traits": [
   {
    "name": "Haha, Didn't Hurt!",
    "text": "Whenever you survive an attack, deal 2 psychic damage back (ignoring Defense)."
   }
  ],
  "actions": [
   {
    "name": "Stab",
    "text": "1d6 (or Shoot, Range 8). Can't crit."
   }
  ],
  "tags": [
   "goblin"
  ]
 },
 "goblin-minion": {
  "name": "Goblin Minion",
  "source": "GMG p.30",
  "level": 0,
  "size": "Small",
  "type": "Goblin",
  "role": "minion",
  "armor": "none",
  "die": 6,
  "speed": 6,
  "traits": [
   {
    "name": "Haha, Missed Me!",
    "text": "Whenever you survive an attack, deal 2 psychic damage back (ignoring Defense)."
   }
  ],
  "actions": [
   {
    "name": "Stab",
    "text": "1d6 (follows minion rules)."
   }
  ],
  "tags": [
   "goblin"
  ]
 },
 "goblin-taskmaster": {
  "name": "Goblin Taskmaster",
  "source": "GMG p.30",
  "level": 2,
  "size": "Small",
  "type": "Goblin",
  "role": "regular",
  "armor": "none",
  "hp": 30,
  "speed": 6,
  "traits": [
   {
    "name": "Gotta Do Better Than That!",
    "text": "Whenever you survive an attack, deal 2 psychic damage back (ignoring Defense)."
   },
   {
    "name": "Meat Shield",
    "text": "Can force other Goblins to Interpose for you."
   }
  ],
  "actions": [
   {
    "name": "Stab",
    "text": "1d6 (or Shoot, Range 8). Then:"
   },
   {
    "name": "Get In Here!",
    "text": "Call a Goblin Minion to the fight."
   }
  ],
  "flavor": "Mean enough to boss other goblins around and survive the attempt. They often work under the heel of Bugbears, screaming secondhand orders and threats they usually can't deliver on.",
  "tactics": {
   "easier": "May \"run out\" of minions to call to the battlefield, or their minions may be out of position to Interpose for them.",
   "harder": "Keep a minion within Interpose range at all times!"
  },
  "tags": [
   "goblin",
   "leader"
  ]
 },
 "goblin-ratrider": {
  "name": "Goblin Ratrider",
  "source": "GMG p.30",
  "level": 2,
  "size": "Medium",
  "type": "Goblin",
  "role": "regular",
  "armor": "none",
  "hp": 30,
  "speed": 10,
  "traits": [
   {
    "name": "Haha, Nice Try!",
    "text": "Whenever you survive an attack, deal 2 psychic damage back (ignoring Defense)."
   },
   {
    "name": "CHAAARGE!",
    "text": "If you move at least 4 spaces in a straight line, your next attack is advantaged."
   }
  ],
  "actions": [
   {
    "name": "Bite & Stab (2x)",
    "text": "1d6. On crit, Prone."
   }
  ],
  "flavor": "Riding into battle atop mangy giant rats, these goblins are thrill-seekers and scouts. Their mounts are as diseased and unpredictable as their riders.",
  "tactics": {
   "easier": "Can stay more stationary or spread their damage around; don't attack Prone targets.",
   "harder": "Hunt down backline and isolated heroes. Stay out of reach of melee heroes; set up powerful attacks for Bugbears when they knock heroes Prone."
  },
  "tags": [
   "goblin"
  ]
 },
 "nilbog": {
  "name": "Nilbog",
  "source": "M&M p.6",
  "level": 3,
  "size": "Medium",
  "type": "Goblin",
  "role": "regular",
  "armor": "none",
  "hp": 40,
  "speed": 6,
  "traits": [
   {
    "name": "Backwards Chaos",
    "text": "Attacks that would hit a Nilbog instead miss; attacks that would miss, hit instead."
   },
   {
    "name": "Neener Neener!",
    "text": "When a hero's attack misses a Goblin, or when a hero could opportunity attack a Goblin but doesn't: deal 4 psychic damage."
   }
  ],
  "actions": [],
  "flavor": "The chosen fools: when one arises, logic dies. Entire warrens descend into laughter, worship, and property damage. Minions throw themselves off ledges in reverence and Taskmasters weep in frustration.",
  "tactics": {
   "easier": "Stay near heroes with smaller weapons (d4, d6) or Cheats. Keep Goblins at a distance.",
   "harder": "Stay near heroes with larger weapons (d10, d12) who will have a harder time hitting. Constantly move Goblins in and out of melee range."
  },
  "tags": [
   "goblin"
  ]
 },
 "bugbear": {
  "name": "Bugbear",
  "source": "GMG p.30",
  "level": 2,
  "size": "Medium",
  "type": "Goblin",
  "role": "regular",
  "armor": "none",
  "hp": 30,
  "speed": 6,
  "traits": [],
  "actions": [
   {
    "name": "Bash",
    "text": "(Reach 2) 3d6. On damage, target's next attack is disadvantaged. Or:"
   },
   {
    "name": "Javelin",
    "text": "2d6 (Range 8)."
   }
  ],
  "flavor": "Big, brutish, and permanently grumpy, Bugbears are the heavy muscle of Goblin society. They despise noise and disorder; Bugbears tolerate Goblins' antics in exchange for servitude and a steady supply of things to hit.",
  "tactics": {
   "easier": "Attack from Range or spread damage out. Attack first in a round while heroes can still Interpose & Defend.",
   "harder": "Bugbears are patient ambushers; they can start combat hidden, attacking any hero who has strayed too far from his party, or their back lines."
  },
  "tags": [
   "goblinoid"
  ]
 },
 "bugbear-chieftain": {
  "name": "Bugbear Chieftain",
  "source": "M&M p.7",
  "level": 4,
  "size": "Medium",
  "type": "Goblin",
  "role": "regular",
  "armor": "M",
  "hp": 40,
  "speed": 6,
  "traits": [
   {
    "name": "I want results!",
    "text": "Goblins gain +2 speed and advantage on attacks."
   }
  ],
  "actions": [
   {
    "name": "Cleave",
    "text": "(Reach 2) 2d6+10, can also damage a 2nd target within Reach."
   }
  ],
  "flavor": "Chieftains rule with fear, iron clubs, and a zero-tolerance policy for goblin antics (except the useful kind). Under their leadership, goblins become surprisingly efficient raiders, at least for a few weeks.",
  "tactics": {
   "easier": "Use Cleave to also strike a goblin that is in your way.",
   "harder": "Target only heroes. Force a goblin to Interpose for you."
  },
  "tags": [
   "goblinoid",
   "leader"
  ]
 },
 "krogg": {
  "name": "Krogg, Goblin King",
  "source": "GMG p.14",
  "level": 2,
  "size": "Medium",
  "type": "Angry Bugbear",
  "role": "legendary",
  "armor": "none",
  "hpPerHero": 28,
  "speed": 6,
  "saves": "STR+ DEX+",
  "traits": [],
  "actions": [],
  "legendary": [
   {
    "name": "Manglemaul",
    "text": "Move 6. 2d6, Grappled (escape DC 10). Or:"
   },
   {
    "name": "Crack Skulls",
    "text": "Move 6. Swing a Grappled creature at another creature. Both take 2d6, ending the Grapple."
   }
  ],
  "bloodied": {
   "name": "Enraged",
   "text": "Krogg's damage increases to d8s."
  },
  "flavor": "Bugbear, strong, crafty (smarter than average goblins). Wears a crown of metal scraps. Wields a Manglemaul, a warhammer with a bear trap on the end.",
  "tags": [
   "goblinoid",
   "boss"
  ]
 },
 "krogg-solo": {
  "name": "Krogg, Goblin King (Solo)",
  "source": "M&M p.7",
  "level": 2,
  "size": "Medium",
  "type": "Angry Bugbear",
  "role": "legendary",
  "armor": "none",
  "hp": 90,
  "speed": 6,
  "saves": "STR+ DEX+",
  "traits": [],
  "actions": [],
  "legendary": [
   {
    "name": "Manglemaul",
    "text": "Move 6. 2d6+2 damage, Grappled (escape DC 10). OR:"
   },
   {
    "name": "Crack Skulls",
    "text": "Move 6. Swing a Grappled creature at another creature. Both take 2d6+2 damage, ending the Grapple."
   }
  ],
  "bloodied": {
   "name": "Bloodied",
   "text": "At 45 HP, Krogg's damage increases to 2d8+2."
  },
  "lastStand": {
   "name": "Last Stand",
   "text": "At 0 HP Krogg is dying! If he takes 20 more damage he dies. Until then, he has Medium armor."
  },
  "flavor": "All hail Krogg, the Goblin King! Goblins respect Krogg, because when Krogg issues a decree, he does so with his fists. He's not, strictly speaking, of \"royal blood\", but anyone capable of keeping Goblins on-task for more than a few minutes deserves the title \"King\".",
  "tactics": {
   "easier": "Have the Manglemaul jam after using Crack Skulls. Krogg gets verbally frustrated with the \"stupid weapon\": it loses the ability to Grapple, or he could spend a turn fixing it.",
   "harder": "Manglemaul may retain the Grappled target, so Crack Skulls can be used again next turn. Or you could also knock heroes Prone after Cracking Skulls. Move more frequently; end your turn out of reach of melee heroes."
  },
  "tags": [
   "goblinoid",
   "boss"
  ]
 },
 "wolf": {
  "name": "Wolf",
  "source": "M&M p.52",
  "level": 0.5,
  "size": "Medium",
  "type": "Beast",
  "role": "regular",
  "armor": "none",
  "hp": 18,
  "speed": 10,
  "traits": [
   {
    "name": "Pack Hunters",
    "text": "Flee combat when outnumbered."
   },
   {
    "name": "Fearsome Howl (Forest Wolves)",
    "text": "At the beginning of combat, heroes make a DC 13 WIL save or start Frightened. Ends when 1 wolf dies."
   }
  ],
  "actions": [
   {
    "name": "Bite",
    "text": "1d8+2"
   }
  ],
  "flavor": "Pack hunters that surround and overwhelm prey much larger than themselves.",
  "tactics": {
   "easier": "Allow one wolf to take most of the damage at the beginning, so that Fearsome Howl goes away quickly. Have the Wolves flee early.",
   "harder": "Move in and out of melee range, so that it takes longer for any single wolf to die. Have the Pack Leader Interpose for wolves, to keep them from dying and fleeing."
  },
  "tags": [
   "beast"
  ]
 },
 "dire-wolf": {
  "name": "Dire Wolf",
  "source": "M&M p.52",
  "level": 2,
  "size": "Medium",
  "type": "Beast",
  "role": "regular",
  "armor": "none",
  "hp": 34,
  "speed": 10,
  "traits": [
   {
    "name": "Fearsome Howl (Forest Wolves)",
    "text": "At the beginning of combat, heroes make a DC 13 WIL save or start Frightened. Ends when 1 wolf dies."
   }
  ],
  "actions": [
   {
    "name": "Vicious Bite",
    "text": "2d8+2, Vicious."
   }
  ],
  "flavor": "A monstrous family of wolves with longer claws, sharper teeth, and piercing red eyes. Twice the size of a regular wolf.",
  "tags": [
   "beast"
  ]
 },
 "dire-wolf-pack-leader": {
  "name": "Dire Wolf Pack Leader",
  "source": "M&M p.52",
  "level": 5,
  "size": "Medium",
  "type": "Beast",
  "role": "regular",
  "armor": "none",
  "hp": 60,
  "speed": 10,
  "traits": [
   {
    "name": "Protector of the Pack",
    "text": "(Reach 6) Can Interpose."
   },
   {
    "name": "Fearsome Howl (Forest Wolves)",
    "text": "At the beginning of combat, heroes make a DC 13 WIL save or start Frightened. Ends when 1 wolf dies."
   }
  ],
  "actions": [
   {
    "name": "Vicious Bite (2x)",
    "text": "2d8+2, Vicious."
   }
  ],
  "tags": [
   "beast",
   "leader"
  ]
 },
 "worg": {
  "name": "Worg",
  "source": "GMG p.33",
  "level": 1,
  "size": "Large",
  "type": "Beast",
  "role": "regular",
  "armor": "none",
  "hp": 20,
  "speed": 10,
  "traits": [
   {
    "name": "Savage",
    "text": "Crits on 5+ vs Grappled creatures."
   }
  ],
  "actions": [
   {
    "name": "Rip Apart",
    "text": "2d6, Grappled (escape DC 10)."
   }
  ],
  "flavor": "A cunning mutt, often used as a mount by malevolent creatures.",
  "tactics": {
   "easier": "Switch between targets, minimizing time spent Grappling.",
   "harder": "Focus 1 target, especially if they have disadvantage on rolls."
  },
  "tags": [
   "beast"
  ]
 }
};
