# Edge cases

## Snake case wikilink

```nimble
name: Snake Case Imp
hp: 9
abilities:
- Link Test: See [[snake_case_note]] and [[Goblin|the goblin]]
```

## Markup in plain fields

```nimble
name: Tagged <b>Bold</b> Rat
hp: 5
senses: <img src=x onerror="window.__nimbleXss=1"> darkvision
attacks:
- Gnaw 1d4 <i>piercing</i>
```

## Zero HP

```nimble
name: Paper Golem
hp: 0
```

## Tilde fence

~~~nimble
name: Tilde Toad
hp: 7
~~~

## Missing name

```nimble
hp: 10
```
