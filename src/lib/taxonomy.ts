import type { TasteKind } from "@/lib/types";

export interface TaxonomyTrait {
  id: string;
  facet: TasteKind;
  label: string;
  description: string;
  examples: string[];
  weight: number;
}

export const TAXONOMY_VERSION = "movie-quality-taxonomy-v1";

export const TAXONOMY_TRAITS: TaxonomyTrait[] = [
  {
    id: "moral_compromise",
    facet: "theme",
    label: "moral compromise",
    description: "Characters make ethically messy choices where the right answer is unclear.",
    examples: ["Michael Clayton", "Sicario", "The Insider"],
    weight: 1.15
  },
  {
    id: "systems_corruption",
    facet: "theme",
    label: "systems corruption",
    description: "Institutions, companies, governments, or law enforcement are compromised from within.",
    examples: ["The Departed", "Serpico", "Spotlight"],
    weight: 1.1
  },
  {
    id: "identity_deception",
    facet: "theme",
    label: "identity deception",
    description: "False identities, double lives, impostors, undercover roles, or hidden selves drive the story.",
    examples: ["The Talented Mr. Ripley", "Face/Off", "Catch Me If You Can"],
    weight: 1.05
  },
  {
    id: "procedural_unraveling",
    facet: "structure",
    label: "procedural unraveling",
    description: "The plot advances through investigation, evidence, planning, deduction, and problem solving.",
    examples: ["Zodiac", "All the President's Men", "The Bourne Ultimatum"],
    weight: 1.15
  },
  {
    id: "paranoid_investigation",
    facet: "tone",
    label: "paranoid investigation",
    description: "A tense search for truth where surveillance, betrayal, or hidden power creates paranoia.",
    examples: ["The Conversation", "Tinker Tailor Soldier Spy", "Enemy of the State"],
    weight: 1.15
  },
  {
    id: "competent_professional_under_pressure",
    facet: "protagonist",
    label: "competent professional under pressure",
    description: "A skilled operator, investigator, lawyer, agent, or specialist is tested by escalating pressure.",
    examples: ["Michael Clayton", "Argo", "The Fugitive"],
    weight: 1.1
  },
  {
    id: "outsider_against_system",
    facet: "conflict",
    label: "outsider against system",
    description: "A person outside the dominant institution pushes against a larger system or power structure.",
    examples: ["Erin Brockovich", "The Insider", "Moneyball"],
    weight: 1.05
  },
  {
    id: "contained_tension",
    facet: "stakes",
    label: "contained tension",
    description: "Pressure builds inside a limited space, small arena, or tightly bounded situation.",
    examples: ["12 Angry Men", "Phone Booth", "Locke"],
    weight: 1
  },
  {
    id: "slow_burn_dread",
    facet: "pacing",
    label: "slow-burn dread",
    description: "Suspense accumulates gradually through atmosphere, restraint, and delayed revelation.",
    examples: ["No Country for Old Men", "Zodiac", "The Witch"],
    weight: 1.05
  },
  {
    id: "propulsive_momentum",
    facet: "pacing",
    label: "propulsive momentum",
    description: "A constantly moving story driven by pursuit, deadlines, missions, or escalating action.",
    examples: ["Mad Max: Fury Road", "The Bourne Ultimatum", "Speed"],
    weight: 1
  },
  {
    id: "darkly_comic_crime",
    facet: "tone",
    label: "darkly comic crime",
    description: "Crime, violence, or scams are presented with sharp humor, irony, or absurdity.",
    examples: ["In Bruges", "Snatch", "Fargo"],
    weight: 1.05
  },
  {
    id: "cathartic_justice",
    facet: "emotional_payoff",
    label: "cathartic justice",
    description: "The story delivers emotional satisfaction through truth, accountability, revenge, or vindication.",
    examples: ["The Shawshank Redemption", "Spotlight", "John Wick"],
    weight: 1
  },
  {
    id: "bittersweet_resolution",
    facet: "emotional_payoff",
    label: "bittersweet resolution",
    description: "The ending resolves the story with emotional cost, ambiguity, or partial loss.",
    examples: ["La La Land", "Lost in Translation", "Manchester by the Sea"],
    weight: 1
  },
  {
    id: "tragic_inevitability",
    facet: "emotional_payoff",
    label: "tragic inevitability",
    description: "Events feel like they are moving toward an unavoidable loss or moral collapse.",
    examples: ["There Will Be Blood", "The Godfather Part II", "Requiem for a Dream"],
    weight: 1.1
  },
  {
    id: "redemptive_arc",
    facet: "emotional_payoff",
    label: "redemptive arc",
    description: "A flawed character seeks repair, forgiveness, sacrifice, or moral recovery.",
    examples: ["Gran Torino", "The Wrestler", "Good Will Hunting"],
    weight: 0.95
  },
  {
    id: "antihero_descent",
    facet: "protagonist",
    label: "antihero descent",
    description: "A charismatic or capable protagonist slides deeper into corruption, obsession, or violence.",
    examples: ["Nightcrawler", "Scarface", "Taxi Driver"],
    weight: 1.1
  },
  {
    id: "alienated_loner",
    facet: "protagonist",
    label: "alienated loner",
    description: "A socially isolated figure moves through the story with disconnection, repression, or obsession.",
    examples: ["Drive", "Taxi Driver", "Her"],
    weight: 0.95
  },
  {
    id: "ensemble_under_pressure",
    facet: "structure",
    label: "ensemble under pressure",
    description: "A group dynamic is stressed by danger, work, crisis, loyalty, or competing agendas.",
    examples: ["Apollo 13", "Ocean's Eleven", "The Thing"],
    weight: 1
  },
  {
    id: "heist_or_operation",
    facet: "structure",
    label: "heist or operation",
    description: "A plan, mission, theft, extraction, or operation provides the story engine.",
    examples: ["Heat", "Inception", "Mission: Impossible"],
    weight: 1.05
  },
  {
    id: "cat_and_mouse",
    facet: "structure",
    label: "cat-and-mouse pursuit",
    description: "The story centers on pursuit, evasion, hunter and hunted, or strategic counter-moves.",
    examples: ["Catch Me If You Can", "The Fugitive", "No Country for Old Men"],
    weight: 1.05
  },
  {
    id: "conspiracy_uncovered",
    facet: "structure",
    label: "conspiracy uncovered",
    description: "Hidden coordination, secrets, or cover-ups are revealed piece by piece.",
    examples: ["All the President's Men", "The Parallax View", "State of Play"],
    weight: 1.1
  },
  {
    id: "survival_pressure",
    facet: "stakes",
    label: "survival pressure",
    description: "Characters are pushed by immediate physical danger, entrapment, escape, or life-or-death stakes.",
    examples: ["The Revenant", "Gravity", "A Quiet Place"],
    weight: 1.05
  },
  {
    id: "real_world_consequences",
    facet: "stakes",
    label: "real-world consequences",
    description: "The story feels grounded in politics, journalism, war, law, business, history, or public impact.",
    examples: ["Argo", "The Big Short", "Spotlight"],
    weight: 1
  },
  {
    id: "personal_stakes_over_spectacle",
    facet: "stakes",
    label: "personal stakes over spectacle",
    description: "The emotional or relational cost matters more than scale, explosions, or world-ending stakes.",
    examples: ["Good Will Hunting", "The Wrestler", "Before Sunset"],
    weight: 0.95
  },
  {
    id: "high_concept_puzzle",
    facet: "structure",
    label: "high-concept puzzle",
    description: "A clever premise, ruleset, mystery, or conceptual mechanism drives audience engagement.",
    examples: ["Memento", "Inception", "Primer"],
    weight: 1.05
  },
  {
    id: "mind_bending_reality",
    facet: "theme",
    label: "mind-bending reality",
    description: "Reality, memory, perception, dreams, or timelines are unstable or questioned.",
    examples: ["The Matrix", "Eternal Sunshine of the Spotless Mind", "Shutter Island"],
    weight: 1.05
  },
  {
    id: "existential_wonder",
    facet: "theme",
    label: "existential wonder",
    description: "The film asks big questions about meaning, time, mortality, humanity, or consciousness.",
    examples: ["Arrival", "Interstellar", "2001: A Space Odyssey"],
    weight: 1
  },
  {
    id: "grounded_sci_fi_emotion",
    facet: "theme",
    label: "grounded sci-fi emotion",
    description: "Speculative ideas are anchored in intimate human emotion and relationships.",
    examples: ["Arrival", "Her", "Children of Men"],
    weight: 1
  },
  {
    id: "social_satire",
    facet: "tone",
    label: "social satire",
    description: "The film critiques class, media, capitalism, race, politics, or culture through satire.",
    examples: ["Parasite", "Get Out", "The Menu"],
    weight: 1.05
  },
  {
    id: "class_pressure",
    facet: "theme",
    label: "class pressure",
    description: "Status, wealth, poverty, labor, social mobility, or class resentment shape the conflict.",
    examples: ["Parasite", "The Pursuit of Happyness", "Snowpiercer"],
    weight: 0.95
  },
  {
    id: "family_obligation",
    facet: "theme",
    label: "family obligation",
    description: "Duty, loyalty, inheritance, parenting, siblings, or family identity drives choices.",
    examples: ["The Godfather", "Little Miss Sunshine", "Minari"],
    weight: 0.95
  },
  {
    id: "found_family_bond",
    facet: "emotional_payoff",
    label: "found-family bond",
    description: "Connection forms through chosen loyalty, teams, unlikely friendships, or surrogate family.",
    examples: ["Guardians of the Galaxy", "The Iron Giant", "The Breakfast Club"],
    weight: 0.9
  },
  {
    id: "romantic_longing",
    facet: "emotional_payoff",
    label: "romantic longing",
    description: "Desire, missed timing, yearning, intimacy, or emotional distance shapes the story.",
    examples: ["Before Sunrise", "In the Mood for Love", "Atonement"],
    weight: 0.95
  },
  {
    id: "melancholic_reflection",
    facet: "tone",
    label: "melancholic reflection",
    description: "The film has a reflective, wistful, or quietly sorrowful emotional register.",
    examples: ["Lost in Translation", "Past Lives", "The Remains of the Day"],
    weight: 0.9
  },
  {
    id: "warm_humanist",
    facet: "tone",
    label: "warm humanist",
    description: "The story emphasizes empathy, generosity, tenderness, and human decency.",
    examples: ["Chef", "Paddington 2", "The Holdovers"],
    weight: 0.9
  },
  {
    id: "bleak_nihilistic",
    facet: "tone",
    label: "bleak nihilistic",
    description: "The worldview is harsh, fatalistic, morally cold, or emotionally punishing.",
    examples: ["Se7en", "No Country for Old Men", "The Road"],
    weight: 1
  },
  {
    id: "stylized_cool",
    facet: "tone",
    label: "stylized cool",
    description: "Style, attitude, music, visuals, and controlled mood are major parts of the appeal.",
    examples: ["Drive", "Pulp Fiction", "Baby Driver"],
    weight: 0.95
  },
  {
    id: "visceral_action_craft",
    facet: "tone",
    label: "visceral action craft",
    description: "Action works through physical clarity, choreography, impact, and practical intensity.",
    examples: ["John Wick", "Mad Max: Fury Road", "The Raid"],
    weight: 0.95
  },
  {
    id: "kinetic_chase_escalation",
    facet: "pacing",
    label: "kinetic chase escalation",
    description: "Momentum comes from pursuit, flight, vehicles, escapes, and set pieces that keep escalating.",
    examples: ["Mad Max: Fury Road", "The Bourne Ultimatum", "Speed"],
    weight: 1
  },
  {
    id: "wasteland_survival_pressure",
    facet: "stakes",
    label: "wasteland survival pressure",
    description: "Characters fight through scarcity, harsh terrain, hostile factions, and survivalist rules.",
    examples: ["Mad Max: Fury Road", "The Road", "Children of Men"],
    weight: 0.95
  },
  {
    id: "revenge_liberation_drive",
    facet: "emotional_payoff",
    label: "revenge liberation drive",
    description: "The emotional pull comes from retaliation, escape from captivity, liberation, or reclaimed agency.",
    examples: ["Kill Bill", "Gladiator", "Mad Max: Fury Road"],
    weight: 0.95
  },
  {
    id: "spectacle_adventure",
    facet: "stakes",
    label: "spectacle adventure",
    description: "Scale, set pieces, exploration, fantasy, or large cinematic adventure provide the appeal.",
    examples: ["Jurassic Park", "Avatar", "Raiders of the Lost Ark"],
    weight: 0.9
  },
  {
    id: "mythic_heroism",
    facet: "theme",
    label: "mythic heroism",
    description: "The story uses archetypal heroes, destiny, sacrifice, legends, or grand moral battles.",
    examples: ["The Lord of the Rings", "Star Wars", "Gladiator"],
    weight: 0.95
  },
  {
    id: "coming_of_age",
    facet: "theme",
    label: "coming of age",
    description: "Growth, self-discovery, identity formation, or adolescence is central.",
    examples: ["Lady Bird", "Stand by Me", "Boyhood"],
    weight: 0.9
  },
  {
    id: "fish_out_of_water",
    facet: "protagonist",
    label: "fish out of water",
    description: "A character is thrown into an unfamiliar world, role, class, culture, or situation.",
    examples: ["My Cousin Vinny", "Lost in Translation", "Legally Blonde"],
    weight: 0.85
  },
  {
    id: "underdog_competence",
    facet: "protagonist",
    label: "underdog competence",
    description: "An underestimated person or group earns respect through ability, grit, or ingenuity.",
    examples: ["Moneyball", "Rocky", "The Martian"],
    weight: 0.95
  },
  {
    id: "mentor_student_growth",
    facet: "structure",
    label: "mentor-student growth",
    description: "Learning, training, mentorship, discipline, or intergenerational influence drives change.",
    examples: ["Whiplash", "Good Will Hunting", "The Karate Kid"],
    weight: 0.9
  },
  {
    id: "obsessive_ambition",
    facet: "theme",
    label: "obsessive ambition",
    description: "A drive for greatness, status, art, money, success, or control becomes consuming.",
    examples: ["Whiplash", "The Social Network", "Black Swan"],
    weight: 1.05
  },
  {
    id: "creative_process",
    facet: "theme",
    label: "creative process",
    description: "Art, performance, invention, music, writing, filmmaking, or craft is central.",
    examples: ["Amadeus", "Birdman", "Tick, Tick... Boom!"],
    weight: 0.85
  },
  {
    id: "workplace_pressure",
    facet: "conflict",
    label: "workplace pressure",
    description: "Professional hierarchy, deadlines, bosses, clients, or institutional demands create conflict.",
    examples: ["The Devil Wears Prada", "Margin Call", "Spotlight"],
    weight: 0.9
  },
  {
    id: "legal_or_bureaucratic_combat",
    facet: "conflict",
    label: "legal or bureaucratic combat",
    description: "Rules, courts, paperwork, hearings, procedure, or bureaucracy become a battlefield.",
    examples: ["A Few Good Men", "Dark Waters", "Philadelphia"],
    weight: 1
  },
  {
    id: "media_truth_seeking",
    facet: "protagonist",
    label: "media truth-seeking",
    description: "Journalists, writers, broadcasters, or documentarians pursue truth under pressure.",
    examples: ["Spotlight", "Good Night, and Good Luck", "The Post"],
    weight: 1
  },
  {
    id: "criminal_code_loyalty",
    facet: "theme",
    label: "criminal code loyalty",
    description: "Honor, betrayal, friendship, family, or reputation within criminal worlds drives choices.",
    examples: ["Goodfellas", "The Godfather", "Donnie Brasco"],
    weight: 1.05
  },
  {
    id: "revenge_engine",
    facet: "structure",
    label: "revenge engine",
    description: "The plot is powered by payback, retaliation, punishment, or settling a wrong.",
    examples: ["John Wick", "Kill Bill", "Gladiator"],
    weight: 0.95
  },
  {
    id: "grief_processing",
    facet: "theme",
    label: "grief processing",
    description: "Loss, mourning, trauma, or emotional recovery is central to the character journey.",
    examples: ["Manchester by the Sea", "Arrival", "Rabbit Hole"],
    weight: 0.95
  },
  {
    id: "trauma_survival",
    facet: "theme",
    label: "trauma survival",
    description: "Characters endure, revisit, or overcome trauma, abuse, violence, or psychological harm.",
    examples: ["Room", "Mysterious Skin", "The Nightingale"],
    weight: 0.95
  },
  {
    id: "claustrophobic_horror",
    facet: "tone",
    label: "claustrophobic horror",
    description: "Fear comes from confinement, isolation, unseen threat, or inability to escape.",
    examples: ["Alien", "The Descent", "10 Cloverfield Lane"],
    weight: 0.95
  },
  {
    id: "psychological_unraveling",
    facet: "structure",
    label: "psychological unraveling",
    description: "A character's sanity, certainty, memory, or identity deteriorates over the film.",
    examples: ["Black Swan", "Shutter Island", "The Machinist"],
    weight: 1.05
  },
  {
    id: "domestic_tension",
    facet: "conflict",
    label: "domestic tension",
    description: "Marriage, parenting, home life, neighbors, or intimate relationships become pressure points.",
    examples: ["Marriage Story", "Revolutionary Road", "A Separation"],
    weight: 0.9
  },
  {
    id: "intimate_two_hander",
    facet: "structure",
    label: "intimate two-hander",
    description: "The film depends heavily on a charged relationship between two central characters.",
    examples: ["Before Sunset", "Collateral", "Certified Copy"],
    weight: 0.9
  },
  {
    id: "ensemble_hangout",
    facet: "structure",
    label: "ensemble hangout",
    description: "Pleasure comes from spending time with a group, banter, rhythm, and character chemistry.",
    examples: ["Dazed and Confused", "Ocean's Eleven", "Everybody Wants Some!!"],
    weight: 0.85
  },
  {
    id: "absurdist_escalation",
    facet: "tone",
    label: "absurdist escalation",
    description: "Events become increasingly strange, chaotic, ironic, or farcical.",
    examples: ["Burn After Reading", "The Death of Stalin", "Sorry to Bother You"],
    weight: 0.95
  },
  {
    id: "fishhook_opening_mystery",
    facet: "structure",
    label: "fishhook opening mystery",
    description: "The film begins with a compelling question or disruption that pulls the story forward.",
    examples: ["Gone Girl", "Memento", "Knives Out"],
    weight: 0.9
  },
  {
    id: "twist_recontextualization",
    facet: "emotional_payoff",
    label: "twist recontextualization",
    description: "A reveal changes how earlier events, characters, or motivations are understood.",
    examples: ["The Sixth Sense", "The Prestige", "Fight Club"],
    weight: 0.95
  },
  {
    id: "clean_resolution",
    facet: "emotional_payoff",
    label: "clean resolution",
    description: "The plot resolves clearly with answers, closure, or a satisfying completed arc.",
    examples: ["Knives Out", "The Martian", "A Few Good Men"],
    weight: 0.8
  },
  {
    id: "ambiguous_ending",
    facet: "emotional_payoff",
    label: "ambiguous ending",
    description: "The ending leaves meaning, fate, morality, or truth open to interpretation.",
    examples: ["Inception", "No Country for Old Men", "The Graduate"],
    weight: 0.9
  },
  {
    id: "quiet_realism",
    facet: "tone",
    label: "quiet realism",
    description: "The film favors naturalism, restraint, everyday detail, and emotional observation.",
    examples: ["Nomadland", "Paterson", "A Separation"],
    weight: 0.85
  },
  {
    id: "prestige_intensity",
    facet: "tone",
    label: "prestige intensity",
    description: "Dramatic weight, strong performances, and serious themes create sustained intensity.",
    examples: ["There Will Be Blood", "The Master", "Mystic River"],
    weight: 0.95
  },
  {
    id: "feel_good_momentum",
    facet: "tone",
    label: "feel-good momentum",
    description: "The story creates upbeat, charming, crowd-pleasing energy and emotional uplift.",
    examples: ["Chef", "School of Rock", "The Intouchables"],
    weight: 0.8
  },
  {
    id: "sports_or_competition_drive",
    facet: "structure",
    label: "sports or competition drive",
    description: "Competition, contests, games, races, performance, or measurable achievement structures the film.",
    examples: ["Rocky", "Ford v Ferrari", "King Richard"],
    weight: 0.85
  },
  {
    id: "war_room_strategy",
    facet: "structure",
    label: "war-room strategy",
    description: "Strategic planning, tactical debate, expert coordination, or high-stakes decision-making drives scenes.",
    examples: ["Moneyball", "Thirteen Days", "The Big Short"],
    weight: 1
  },
  {
    id: "political_maneuvering",
    facet: "conflict",
    label: "political maneuvering",
    description: "Power is contested through alliances, leverage, diplomacy, public optics, or institutional moves.",
    examples: ["Lincoln", "Primary Colors", "The Ides of March"],
    weight: 1
  },
  {
    id: "techno_anxiety",
    facet: "theme",
    label: "techno-anxiety",
    description: "Technology, surveillance, AI, platforms, systems, or scientific progress creates unease.",
    examples: ["The Social Network", "Ex Machina", "Minority Report"],
    weight: 0.95
  },
  {
    id: "capitalist_pressure",
    facet: "theme",
    label: "capitalist pressure",
    description: "Money, markets, business incentives, exploitation, greed, or economic systems shape conflict.",
    examples: ["The Big Short", "Wall Street", "Margin Call"],
    weight: 1
  },
  {
    id: "obsessive_love",
    facet: "theme",
    label: "obsessive love",
    description: "Romance, desire, jealousy, fixation, or emotional possession becomes dangerous or consuming.",
    examples: ["Vertigo", "Phantom Thread", "Fatal Attraction"],
    weight: 0.9
  },
  {
    id: "friendship_banter",
    facet: "emotional_payoff",
    label: "friendship banter",
    description: "The main pleasure comes from comic chemistry, loyalty, and conversational rhythm between friends.",
    examples: ["Superbad", "The Nice Guys", "Butch Cassidy and the Sundance Kid"],
    weight: 0.85
  },
  {
    id: "parent_child_emotion",
    facet: "theme",
    label: "parent-child emotion",
    description: "Parenting, childhood, sacrifice, reconciliation, or generational understanding is central.",
    examples: ["Finding Nemo", "Aftersun", "Kramer vs. Kramer"],
    weight: 0.9
  },
  {
    id: "family_legacy",
    facet: "theme",
    label: "family legacy",
    description: "Family history, inheritance, ancestry, memory, and obligation shape identity and choices.",
    examples: ["Coco", "The Farewell", "Minari"],
    weight: 1
  },
  {
    id: "generational_reconciliation",
    facet: "emotional_payoff",
    label: "generational reconciliation",
    description: "The emotional payoff comes from healing family wounds across parents, children, elders, or ancestors.",
    examples: ["Coco", "Everything Everywhere All at Once", "The Farewell"],
    weight: 1
  },
  {
    id: "music_as_identity",
    facet: "theme",
    label: "music as identity",
    description: "Music, performance, or artistic expression is tied to selfhood, belonging, and emotional truth.",
    examples: ["Coco", "Sing Street", "Almost Famous"],
    weight: 0.95
  },
  {
    id: "memory_and_grief",
    facet: "emotional_payoff",
    label: "memory and grief",
    description: "Remembering, mourning, honoring the dead, or preserving love across loss drives the feeling.",
    examples: ["Coco", "Aftersun", "A Ghost Story"],
    weight: 0.95
  },
  {
    id: "cultural_belonging",
    facet: "theme",
    label: "cultural belonging",
    description: "The story draws power from heritage, community rituals, language, food, music, or cultural identity.",
    examples: ["Coco", "Moana", "Bend It Like Beckham"],
    weight: 0.9
  },
  {
    id: "worldbuilding_immersion",
    facet: "tone",
    label: "worldbuilding immersion",
    description: "The appeal comes from entering a vivid world, culture, ruleset, environment, or mythology.",
    examples: ["Blade Runner", "Dune", "Spirited Away"],
    weight: 0.9
  },
  {
    id: "visual_poetry",
    facet: "tone",
    label: "visual poetry",
    description: "Mood, image, composition, rhythm, and sensory experience matter more than plot mechanics.",
    examples: ["The Tree of Life", "In the Mood for Love", "Days of Heaven"],
    weight: 0.85
  },
  {
    id: "monster_as_metaphor",
    facet: "theme",
    label: "monster as metaphor",
    description: "Horror, creatures, or supernatural elements express grief, fear, repression, or social anxiety.",
    examples: ["The Babadook", "Get Out", "It Follows"],
    weight: 0.9
  },
  {
    id: "body_horror_discomfort",
    facet: "tone",
    label: "body-horror discomfort",
    description: "Physical transformation, bodily violation, disease, mutation, or visceral disgust creates unease.",
    examples: ["The Fly", "Titane", "The Substance"],
    weight: 0.95
  },
  {
    id: "cosmic_or_supernatural_mystery",
    facet: "theme",
    label: "cosmic or supernatural mystery",
    description: "Unknown forces, metaphysical questions, or supernatural mysteries drive awe or fear.",
    examples: ["Annihilation", "The Others", "Signs"],
    weight: 0.9
  },
  {
    id: "historical_moral_weight",
    facet: "stakes",
    label: "historical moral weight",
    description: "Historical events carry moral seriousness, public consequence, or cultural memory.",
    examples: ["Schindler's List", "12 Years a Slave", "Oppenheimer"],
    weight: 1.05
  },
  {
    id: "biographical_transformation",
    facet: "protagonist",
    label: "biographical transformation",
    description: "A real or fictional life story emphasizes transformation, achievement, cost, or public identity.",
    examples: ["Ray", "The Imitation Game", "Oppenheimer"],
    weight: 0.85
  },
  {
    id: "mystery_box_ensemble",
    facet: "structure",
    label: "mystery-box ensemble",
    description: "Multiple characters, secrets, clues, and misdirection build toward a reveal.",
    examples: ["Knives Out", "Gosford Park", "Clue"],
    weight: 0.95
  }
];

export const TAXONOMY_TRAITS_BY_ID = new Map(TAXONOMY_TRAITS.map((trait) => [trait.id, trait]));

export function taxonomyLabelFor(value: string) {
  return TAXONOMY_TRAITS_BY_ID.get(value)?.label ?? value.replace(/_/g, " ");
}

export function taxonomyTextForEmbedding(trait: TaxonomyTrait) {
  return [
    `Trait: ${trait.label}`,
    `Facet: ${trait.facet}`,
    `Meaning: ${trait.description}`,
    `Movie examples: ${trait.examples.join(", ")}`,
    "Match movies by story engine, character pressure, tone, emotional payoff, and thematic function. Do not match only by genre, setting, actor, or time period."
  ].join("\n");
}
