```5e-class
name: Hearth Warden
hitDie: 10
primary: Wisdom
saves: [STR, WIS]
proficiencies: [Light Armor, Medium Armor, Shields, Simple Weapons, Martial Weapons]
skillChoice: "Choose 2: Athletics, Insight, Medicine, Perception, or Survival"
spellcasting: WIS
spellList: Ranger
resources:
  - name: Hearthfire
    uses: Wisdom modifier
    min: 1
    shortFrom: 5
startingEquipment:
  - label: "(A) Chain Mail, Longsword, Shield and 2 Javelins; or (B) 100 GP"
    options:
      - label: A
        items: [Chain Mail, Longsword, Shield, 2 Javelin]
      - label: B
        gold: 100
toolChoices: { count: 1, from: [Cook's Utensils, Woodcarver's Tools] }
features:
  - level: 1
    name: Hearthfire
    desc: As a Bonus Action, you kindle a warding flame around an ally you can see within 30 feet.
  - level: 1
    name: Warding Style
    desc: Choose one of the following options.
  - level: 1
    name: Ember Guard
    group: Warding Style
    desc: While your flame burns around an ally, attacks against them have disadvantage.
  - level: 1
    name: Ash Step
    group: Warding Style
    desc: You can teleport to an ally your flame warms.
  - level: 2
    name: Spellcasting
    desc: You cast Ranger spells, using Wisdom.
  - level: 3
    name: Warden Circle
    desc: Choose a circle.
  - level: 4
    name: Ability Score Improvement
    desc: Increase one score by 2, or two scores by 1.
levels:
  - { level: 1, pb: 2, features: [Hearthfire, Warding Style] }
  - { level: 2, pb: 2, features: [Spellcasting], slots: [2], prepared: 2 }
  - { level: 3, pb: 2, features: [Warden Circle], slots: [3], prepared: 3 }
  - { level: 4, pb: 2, features: [Ability Score Improvement], slots: [3], prepared: 3 }
  - { level: 5, pb: 3, features: [], slots: [4, 2], prepared: 4 }
subclasses:
  - name: Circle of Embers
    flavor: Warden Circle
    features:
      - { level: 3, name: Banked Coals, desc: Your flame lingers a round after it ends. }
```
