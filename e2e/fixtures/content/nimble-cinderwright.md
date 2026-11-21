```nimble-class
name: Cinderwright
tagline: A smith who hammers fire into the fight.
keyStats: [STR, WIL]
hitDie: 10
startingHp: 17
saves: { adv: STR, dis: DEX }
armor: Mail, Shields
weapons: STR weapons
startingGear: [Club/Mace, Chain Shirt]
resources:
  - name: Forge Dice
    max: 2
    die: d6
    reset: Safe Rest
    dice:
      rolled: spent
      addTo: [attack]
      use: any
      rules: [Strike the Anvil]
      maxSteps:
        - { level: 3, add: 1, subclass: Anvil Oath }
        - { level: 5, add: 1 }
  - name: Ember Mend
    max: 5×LVL
    reset: Safe Rest
    spend: Mend
states:
  - { name: Forgeheat, condition: Forgeheated, feature: Forgeheat }
target: { name: Branded Foe, feature: Brand }
levels:
  - level: 1
    features:
      - name: Strike the Anvil
        text: When you hit with a melee attack, spend any number of Forge Dice and add them to the damage.
      - name: Forgeheat
        text: As an action, you become Forgeheated until the end of the encounter.
      - name: Brand
        text: Mark one creature you can see. Your attacks against it ignore cover.
        uses: WIL
  - level: 2
    features:
      - name: Tempered Will
        text: Your will hardens with the iron.
        increase: { stats: [STR, WIL] }
      - name: Spark Lore
        text: You pick up a little fire magic.
        learn:
          - { kind: utility, from: [Fire], count: 1 }
  - level: 3
    features:
      - name: Subclass
        text: Choose a Cinderwright oath.
  - level: 4
    features:
      - name: Hot Iron
        text: Your Forge Dice are hotter.
  - level: 5
    features:
      - name: Second Anvil
        text: You hold one more Forge Die.
subclasses:
  - name: Anvil Oath
    levels:
      - level: 3
        features:
          - { name: Unbreakable, text: You can't be knocked prone. }
```
