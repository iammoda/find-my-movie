import type { Movie } from "@/lib/types";

export const FALLBACK_MOVIES: Movie[] = [
  {
    tmdbId: 68734,
    title: "Argo",
    overview:
      "A CIA specialist builds a fake film production as cover for a rescue operation during an international hostage crisis.",
    posterPath: "/m5gPWFZFIp4UJFABgWyLkbXv8GX.jpg",
    releaseDate: "2012-10-12",
    runtime: 120,
    voteAverage: 7.3,
    voteCount: 8400,
    popularity: 35,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["hostage", "cia", "rescue", "political"],
    countries: ["US", "IR"],
    credits: { tmdbId: 68734, director: "Ben Affleck", actors: ["Ben Affleck", "Bryan Cranston", "Alan Arkin"] },
    tasteFacts: [
      { tmdbId: 68734, kind: "tone", value: "tense", weight: 1, source: "curated" },
      { tmdbId: 68734, kind: "structure", value: "procedural problem-solving", weight: 1, source: "curated" },
      { tmdbId: 68734, kind: "stakes", value: "real-world stakes", weight: 1, source: "curated" },
      { tmdbId: 68734, kind: "theme", value: "deception and identity", weight: 1, source: "curated" },
      { tmdbId: 68734, kind: "theme", value: "institutional pressure", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 329865,
    title: "Arrival",
    overview:
      "A linguist works with the military to communicate with alien visitors before global fear turns into conflict.",
    posterPath: "/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    releaseDate: "2016-11-11",
    runtime: 116,
    voteAverage: 7.6,
    voteCount: 17600,
    popularity: 60,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 878, name: "Sci-Fi" }
    ],
    keywords: ["language", "first contact", "grief", "military"],
    countries: ["US"],
    credits: { tmdbId: 329865, director: "Denis Villeneuve", actors: ["Amy Adams", "Jeremy Renner", "Forest Whitaker"] },
    tasteFacts: [
      { tmdbId: 329865, kind: "tone", value: "restrained", weight: 1, source: "curated" },
      { tmdbId: 329865, kind: "pacing", value: "slow-burn", weight: 0.9, source: "curated" },
      { tmdbId: 329865, kind: "theme", value: "communication under pressure", weight: 1, source: "curated" },
      { tmdbId: 329865, kind: "emotional_payoff", value: "melancholic wonder", weight: 1, source: "curated" },
      { tmdbId: 329865, kind: "protagonist", value: "competent professional", weight: 0.85, source: "curated" }
    ]
  },
  {
    tmdbId: 1538,
    title: "Collateral",
    overview: "A cab driver is pulled into a night of escalating danger by a precise and ruthless passenger.",
    posterPath: "/iOpi3ut5DhQIbrVVjlnmfy2U7dI.jpg",
    releaseDate: "2004-08-06",
    runtime: 120,
    voteAverage: 7.2,
    voteCount: 5600,
    popularity: 31,
    adult: false,
    genres: [
      { id: 80, name: "Crime" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["night", "assassin", "taxi", "los angeles"],
    countries: ["US"],
    credits: { tmdbId: 1538, director: "Michael Mann", actors: ["Tom Cruise", "Jamie Foxx", "Jada Pinkett Smith"] },
    tasteFacts: [
      { tmdbId: 1538, kind: "tone", value: "tense", weight: 1, source: "curated" },
      { tmdbId: 1538, kind: "pacing", value: "propulsive", weight: 1, source: "curated" },
      { tmdbId: 1538, kind: "stakes", value: "survival pressure", weight: 1, source: "curated" },
      { tmdbId: 1538, kind: "structure", value: "one-night pressure cooker", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 205596,
    title: "The Imitation Game",
    overview:
      "A brilliant mathematician joins a secret wartime effort to crack encrypted messages while hiding his private life.",
    posterPath: "/zSqJ1qFq8NXFfi7JeIYMlzyR0dx.jpg",
    releaseDate: "2014-11-14",
    runtime: 113,
    voteAverage: 8,
    voteCount: 17000,
    popularity: 50,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 36, name: "History" }
    ],
    keywords: ["codebreaking", "war", "secret", "biography"],
    countries: ["GB", "US"],
    credits: { tmdbId: 205596, director: "Morten Tyldum", actors: ["Benedict Cumberbatch", "Keira Knightley", "Matthew Goode"] },
    tasteFacts: [
      { tmdbId: 205596, kind: "structure", value: "procedural problem-solving", weight: 1, source: "curated" },
      { tmdbId: 205596, kind: "stakes", value: "real-world stakes", weight: 1, source: "curated" },
      { tmdbId: 205596, kind: "theme", value: "secrecy and sacrifice", weight: 1, source: "curated" },
      { tmdbId: 205596, kind: "protagonist", value: "brilliant outsider", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 398818,
    title: "Call Me by Your Name",
    overview: "A summer friendship in northern Italy becomes a tender and life-altering first love.",
    posterPath: "/mZ4gBdfkhP9tvLH1DO4m4HYtiyi.jpg",
    releaseDate: "2017-11-24",
    runtime: 132,
    voteAverage: 8.1,
    voteCount: 12000,
    popularity: 38,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 10749, name: "Romance" }
    ],
    keywords: ["first love", "summer", "coming of age"],
    countries: ["IT", "US"],
    credits: { tmdbId: 398818, director: "Luca Guadagnino", actors: ["Timothee Chalamet", "Armie Hammer", "Michael Stuhlbarg"] },
    tasteFacts: [
      { tmdbId: 398818, kind: "tone", value: "sensual", weight: 1, source: "curated" },
      { tmdbId: 398818, kind: "pacing", value: "slow-burn", weight: 1, source: "curated" },
      { tmdbId: 398818, kind: "theme", value: "coming of age", weight: 0.9, source: "curated" },
      { tmdbId: 398818, kind: "emotional_payoff", value: "bittersweet longing", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 27205,
    title: "Inception",
    overview: "A thief who steals secrets through dreams is offered a chance to erase his past with one impossible job.",
    posterPath: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
    releaseDate: "2010-07-16",
    runtime: 148,
    voteAverage: 8.4,
    voteCount: 37000,
    popularity: 90,
    adult: false,
    genres: [
      { id: 28, name: "Action" },
      { id: 878, name: "Sci-Fi" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["dream", "heist", "memory", "team"],
    countries: ["US", "GB"],
    credits: { tmdbId: 27205, director: "Christopher Nolan", actors: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"] },
    tasteFacts: [
      { tmdbId: 27205, kind: "structure", value: "layered puzzle", weight: 1, source: "curated" },
      { tmdbId: 27205, kind: "theme", value: "memory and grief", weight: 0.9, source: "curated" },
      { tmdbId: 27205, kind: "pacing", value: "propulsive", weight: 0.9, source: "curated" },
      { tmdbId: 27205, kind: "structure", value: "ensemble under pressure", weight: 0.8, source: "curated" }
    ]
  },
  {
    tmdbId: 496243,
    title: "Parasite",
    overview: "A poor family infiltrates a wealthy household, setting off a sharp social thriller with escalating consequences.",
    posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    releaseDate: "2019-05-30",
    runtime: 133,
    voteAverage: 8.5,
    voteCount: 18500,
    popularity: 72,
    adult: false,
    genres: [
      { id: 35, name: "Comedy" },
      { id: 53, name: "Thriller" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["class", "deception", "family", "satire"],
    countries: ["KR"],
    credits: { tmdbId: 496243, director: "Bong Joon Ho", actors: ["Song Kang-ho", "Choi Woo-shik", "Park So-dam"] },
    tasteFacts: [
      { tmdbId: 496243, kind: "tone", value: "darkly funny", weight: 1, source: "curated" },
      { tmdbId: 496243, kind: "theme", value: "class pressure", weight: 1, source: "curated" },
      { tmdbId: 496243, kind: "theme", value: "deception and identity", weight: 0.9, source: "curated" },
      { tmdbId: 496243, kind: "structure", value: "escalating reversal", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 77,
    title: "Memento",
    overview: "A man with short-term memory loss searches for his wife's killer using notes, tattoos, and fractured clues.",
    posterPath: "/yuNs09hvpHVU1cBTCAk9zxsL2oW.jpg",
    releaseDate: "2000-10-11",
    runtime: 113,
    voteAverage: 8.2,
    voteCount: 15000,
    popularity: 37,
    adult: false,
    genres: [
      { id: 9648, name: "Mystery" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["memory", "revenge", "noir"],
    countries: ["US"],
    credits: { tmdbId: 77, director: "Christopher Nolan", actors: ["Guy Pearce", "Carrie-Anne Moss", "Joe Pantoliano"] },
    tasteFacts: [
      { tmdbId: 77, kind: "structure", value: "layered puzzle", weight: 1, source: "curated" },
      { tmdbId: 77, kind: "theme", value: "memory and grief", weight: 1, source: "curated" },
      { tmdbId: 77, kind: "tone", value: "noir dread", weight: 0.9, source: "curated" },
      { tmdbId: 77, kind: "theme", value: "moral ambiguity", weight: 0.8, source: "curated" }
    ]
  },
  {
    tmdbId: 37165,
    title: "The Truman Show",
    overview: "A cheerful insurance salesman starts to suspect his entire life is an elaborate television production.",
    posterPath: "/vuza0WqY239yBXOadKlGwJsZJFE.jpg",
    releaseDate: "1998-06-05",
    runtime: 103,
    voteAverage: 8.1,
    voteCount: 18000,
    popularity: 50,
    adult: false,
    genres: [
      { id: 35, name: "Comedy" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["media", "identity", "surveillance", "freedom"],
    countries: ["US"],
    credits: { tmdbId: 37165, director: "Peter Weir", actors: ["Jim Carrey", "Laura Linney", "Ed Harris"] },
    tasteFacts: [
      { tmdbId: 37165, kind: "theme", value: "identity under surveillance", weight: 1, source: "curated" },
      { tmdbId: 37165, kind: "tone", value: "satirical", weight: 0.9, source: "curated" },
      { tmdbId: 37165, kind: "emotional_payoff", value: "liberating catharsis", weight: 1, source: "curated" },
      { tmdbId: 37165, kind: "protagonist", value: "ordinary person awakening", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 106646,
    title: "The Wolf of Wall Street",
    overview: "A stockbroker's rise and collapse becomes a manic portrait of greed, excess, and institutional failure.",
    posterPath: "/pWHf4khOloNVfCxscsXFj3jj6gP.jpg",
    releaseDate: "2013-12-25",
    runtime: 180,
    voteAverage: 8,
    voteCount: 23500,
    popularity: 88,
    adult: false,
    genres: [
      { id: 80, name: "Crime" },
      { id: 18, name: "Drama" },
      { id: 35, name: "Comedy" }
    ],
    keywords: ["greed", "finance", "crime", "satire"],
    countries: ["US"],
    credits: { tmdbId: 106646, director: "Martin Scorsese", actors: ["Leonardo DiCaprio", "Jonah Hill", "Margot Robbie"] },
    tasteFacts: [
      { tmdbId: 106646, kind: "tone", value: "darkly funny", weight: 1, source: "curated" },
      { tmdbId: 106646, kind: "theme", value: "corruption and excess", weight: 1, source: "curated" },
      { tmdbId: 106646, kind: "pacing", value: "propulsive", weight: 0.9, source: "curated" },
      { tmdbId: 106646, kind: "protagonist", value: "charismatic antihero", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 49026,
    title: "The Dark Knight Rises",
    overview: "A broken hero returns when a masked revolutionary threatens to tear Gotham apart.",
    posterPath: "/hr0L2aueqlP2BYUblTTjmtn0hw4.jpg",
    releaseDate: "2012-07-20",
    runtime: 165,
    voteAverage: 7.8,
    voteCount: 23000,
    popularity: 75,
    adult: false,
    genres: [
      { id: 28, name: "Action" },
      { id: 80, name: "Crime" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["hero", "revolution", "sacrifice"],
    countries: ["US"],
    credits: { tmdbId: 49026, director: "Christopher Nolan", actors: ["Christian Bale", "Anne Hathaway", "Tom Hardy"] },
    tasteFacts: [
      { tmdbId: 49026, kind: "stakes", value: "city-scale stakes", weight: 1, source: "curated" },
      { tmdbId: 49026, kind: "theme", value: "sacrifice and legacy", weight: 0.9, source: "curated" },
      { tmdbId: 49026, kind: "tone", value: "operatic dread", weight: 0.8, source: "curated" },
      { tmdbId: 49026, kind: "emotional_payoff", value: "redemptive catharsis", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 603,
    title: "The Matrix",
    overview: "A hacker discovers reality is a simulation and joins a rebellion against machine control.",
    posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    releaseDate: "1999-03-31",
    runtime: 136,
    voteAverage: 8.2,
    voteCount: 25500,
    popularity: 78,
    adult: false,
    genres: [
      { id: 28, name: "Action" },
      { id: 878, name: "Sci-Fi" }
    ],
    keywords: ["simulation", "rebellion", "identity"],
    countries: ["US"],
    credits: { tmdbId: 603, director: "Lana Wachowski, Lilly Wachowski", actors: ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss"] },
    tasteFacts: [
      { tmdbId: 603, kind: "theme", value: "identity awakening", weight: 1, source: "curated" },
      { tmdbId: 603, kind: "structure", value: "chosen-one transformation", weight: 0.8, source: "curated" },
      { tmdbId: 603, kind: "pacing", value: "propulsive", weight: 0.9, source: "curated" },
      { tmdbId: 603, kind: "emotional_payoff", value: "liberating catharsis", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 550,
    title: "Fight Club",
    overview: "An alienated office worker forms a violent underground club that mutates into something uncontrollable.",
    posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    releaseDate: "1999-10-15",
    runtime: 139,
    voteAverage: 8.4,
    voteCount: 29500,
    popularity: 76,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["identity", "consumerism", "violence", "twist"],
    countries: ["US"],
    credits: { tmdbId: 550, director: "David Fincher", actors: ["Edward Norton", "Brad Pitt", "Helena Bonham Carter"] },
    tasteFacts: [
      { tmdbId: 550, kind: "theme", value: "identity fracture", weight: 1, source: "curated" },
      { tmdbId: 550, kind: "tone", value: "darkly funny", weight: 0.85, source: "curated" },
      { tmdbId: 550, kind: "structure", value: "unreliable perspective", weight: 1, source: "curated" },
      { tmdbId: 550, kind: "theme", value: "moral ambiguity", weight: 0.8, source: "curated" }
    ]
  },
  {
    tmdbId: 155,
    title: "The Dark Knight",
    overview: "Batman faces a criminal force designed to expose moral limits and turn order into chaos.",
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    releaseDate: "2008-07-18",
    runtime: 152,
    voteAverage: 8.5,
    voteCount: 33000,
    popularity: 95,
    adult: false,
    genres: [
      { id: 28, name: "Action" },
      { id: 80, name: "Crime" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["chaos", "morality", "crime", "hero"],
    countries: ["US"],
    credits: { tmdbId: 155, director: "Christopher Nolan", actors: ["Christian Bale", "Heath Ledger", "Aaron Eckhart"] },
    tasteFacts: [
      { tmdbId: 155, kind: "theme", value: "moral ambiguity", weight: 1, source: "curated" },
      { tmdbId: 155, kind: "tone", value: "tense", weight: 0.9, source: "curated" },
      { tmdbId: 155, kind: "stakes", value: "city-scale stakes", weight: 1, source: "curated" },
      { tmdbId: 155, kind: "structure", value: "escalating reversal", weight: 0.8, source: "curated" }
    ]
  },
  {
    tmdbId: 120467,
    title: "The Grand Budapest Hotel",
    overview: "A meticulous hotel concierge and his lobby boy become entangled in theft, inheritance, and political change.",
    posterPath: "/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
    releaseDate: "2014-03-07",
    runtime: 100,
    voteAverage: 8,
    voteCount: 15000,
    popularity: 47,
    adult: false,
    genres: [
      { id: 35, name: "Comedy" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["hotel", "friendship", "fable", "heist"],
    countries: ["US", "DE"],
    credits: { tmdbId: 120467, director: "Wes Anderson", actors: ["Ralph Fiennes", "Tony Revolori", "Saoirse Ronan"] },
    tasteFacts: [
      { tmdbId: 120467, kind: "tone", value: "whimsical melancholy", weight: 1, source: "curated" },
      { tmdbId: 120467, kind: "structure", value: "storybook framing", weight: 0.9, source: "curated" },
      { tmdbId: 120467, kind: "emotional_payoff", value: "bittersweet nostalgia", weight: 1, source: "curated" },
      { tmdbId: 120467, kind: "theme", value: "loyalty under pressure", weight: 0.8, source: "curated" }
    ]
  },
  {
    tmdbId: 103663,
    title: "The Hunt",
    overview: "A teacher's life collapses when a false accusation spreads through a close community.",
    posterPath: "/jkixsXzRh28q3PCqFoWcf7unghT.jpg",
    releaseDate: "2012-09-24",
    runtime: 116,
    voteAverage: 8.1,
    voteCount: 3800,
    popularity: 25,
    adult: false,
    genres: [{ id: 18, name: "Drama" }],
    keywords: ["accusation", "community", "moral panic"],
    countries: ["DK"],
    credits: { tmdbId: 103663, director: "Thomas Vinterberg", actors: ["Mads Mikkelsen", "Thomas Bo Larsen", "Annika Wedderkopp"] },
    tasteFacts: [
      { tmdbId: 103663, kind: "tone", value: "restrained", weight: 1, source: "curated" },
      { tmdbId: 103663, kind: "stakes", value: "social survival", weight: 1, source: "curated" },
      { tmdbId: 103663, kind: "theme", value: "moral ambiguity", weight: 0.9, source: "curated" },
      { tmdbId: 103663, kind: "emotional_payoff", value: "devastating ambiguity", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 508439,
    title: "On the Waterfront",
    overview: "A dockworker wrestles with conscience and loyalty as corruption controls his waterfront community.",
    posterPath: "/jwm6t8e6odMRoQ3Z9FQY64ITwb7.jpg",
    releaseDate: "1954-06-22",
    runtime: 108,
    voteAverage: 7.9,
    voteCount: 1500,
    popularity: 14,
    adult: false,
    genres: [
      { id: 80, name: "Crime" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["corruption", "conscience", "labor"],
    countries: ["US"],
    credits: { tmdbId: 508439, director: "Elia Kazan", actors: ["Marlon Brando", "Eva Marie Saint", "Karl Malden"] },
    tasteFacts: [
      { tmdbId: 508439, kind: "theme", value: "moral courage", weight: 1, source: "curated" },
      { tmdbId: 508439, kind: "theme", value: "institutional pressure", weight: 0.9, source: "curated" },
      { tmdbId: 508439, kind: "emotional_payoff", value: "cathartic justice", weight: 0.9, source: "curated" },
      { tmdbId: 508439, kind: "protagonist", value: "conflicted insider", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 807,
    title: "Se7en",
    overview: "Two detectives track a killer whose crimes are staged as a grim moral argument.",
    posterPath: "/69Sns8WoET6CfaYlIkHbla4l7nC.jpg",
    releaseDate: "1995-09-22",
    runtime: 127,
    voteAverage: 8.4,
    voteCount: 21000,
    popularity: 60,
    adult: false,
    genres: [
      { id: 80, name: "Crime" },
      { id: 9648, name: "Mystery" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["serial killer", "detective", "morality"],
    countries: ["US"],
    credits: { tmdbId: 807, director: "David Fincher", actors: ["Brad Pitt", "Morgan Freeman", "Gwyneth Paltrow"] },
    tasteFacts: [
      { tmdbId: 807, kind: "tone", value: "noir dread", weight: 1, source: "curated" },
      { tmdbId: 807, kind: "structure", value: "procedural problem-solving", weight: 0.9, source: "curated" },
      { tmdbId: 807, kind: "theme", value: "moral ambiguity", weight: 1, source: "curated" },
      { tmdbId: 807, kind: "emotional_payoff", value: "devastating ambiguity", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 264644,
    title: "Room",
    overview: "A mother and child escape captivity and face the frightening work of rebuilding a life outside.",
    posterPath: "/pCURNjeomWbMSdiP64gj8NVVHTQ.jpg",
    releaseDate: "2015-10-16",
    runtime: 118,
    voteAverage: 8,
    voteCount: 8900,
    popularity: 25,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 53, name: "Thriller" }
    ],
    keywords: ["captivity", "mother", "child", "trauma"],
    countries: ["CA", "IE", "US"],
    credits: { tmdbId: 264644, director: "Lenny Abrahamson", actors: ["Brie Larson", "Jacob Tremblay", "Joan Allen"] },
    tasteFacts: [
      { tmdbId: 264644, kind: "stakes", value: "survival pressure", weight: 1, source: "curated" },
      { tmdbId: 264644, kind: "emotional_payoff", value: "healing after trauma", weight: 1, source: "curated" },
      { tmdbId: 264644, kind: "tone", value: "intimate", weight: 0.9, source: "curated" },
      { tmdbId: 264644, kind: "theme", value: "parental devotion", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 77338,
    title: "The Intouchables",
    overview: "An unlikely friendship forms between a wealthy quadriplegic man and his new caregiver.",
    posterPath: "/1QU7HKgsQbGpzsJbJK4pAVQV9F5.jpg",
    releaseDate: "2011-11-02",
    runtime: 113,
    voteAverage: 8.3,
    voteCount: 16500,
    popularity: 42,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 35, name: "Comedy" }
    ],
    keywords: ["friendship", "caregiver", "class"],
    countries: ["FR"],
    credits: { tmdbId: 77338, director: "Olivier Nakache, Eric Toledano", actors: ["Francois Cluzet", "Omar Sy", "Anne Le Ny"] },
    tasteFacts: [
      { tmdbId: 77338, kind: "tone", value: "warm", weight: 1, source: "curated" },
      { tmdbId: 77338, kind: "theme", value: "unlikely friendship", weight: 1, source: "curated" },
      { tmdbId: 77338, kind: "emotional_payoff", value: "uplifting catharsis", weight: 1, source: "curated" },
      { tmdbId: 77338, kind: "structure", value: "character transformation", weight: 0.8, source: "curated" }
    ]
  },
  {
    tmdbId: 76341,
    title: "Mad Max: Fury Road",
    overview: "A fugitive driver and a rebel warrior cross a desert wasteland while being hunted by a tyrant's army.",
    posterPath: "/hA2ple9q4qnwxp3hKVNhroipsir.jpg",
    releaseDate: "2015-05-15",
    runtime: 121,
    voteAverage: 7.6,
    voteCount: 22500,
    popularity: 70,
    adult: false,
    genres: [
      { id: 28, name: "Action" },
      { id: 12, name: "Adventure" },
      { id: 878, name: "Sci-Fi" }
    ],
    keywords: ["escape", "desert", "survival", "rebellion"],
    countries: ["AU", "US"],
    credits: { tmdbId: 76341, director: "George Miller", actors: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"] },
    tasteFacts: [
      { tmdbId: 76341, kind: "pacing", value: "propulsive", weight: 1, source: "curated" },
      { tmdbId: 76341, kind: "stakes", value: "survival pressure", weight: 1, source: "curated" },
      { tmdbId: 76341, kind: "theme", value: "liberation from tyranny", weight: 0.9, source: "curated" },
      { tmdbId: 76341, kind: "structure", value: "chase as narrative", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 244786,
    title: "Whiplash",
    overview: "A jazz drummer is pushed into obsession by a teacher whose methods blur ambition and abuse.",
    posterPath: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
    releaseDate: "2014-10-10",
    runtime: 107,
    voteAverage: 8.4,
    voteCount: 15000,
    popularity: 56,
    adult: false,
    genres: [
      { id: 18, name: "Drama" },
      { id: 10402, name: "Music" }
    ],
    keywords: ["ambition", "teacher", "music", "obsession"],
    countries: ["US"],
    credits: { tmdbId: 244786, director: "Damien Chazelle", actors: ["Miles Teller", "J.K. Simmons", "Melissa Benoist"] },
    tasteFacts: [
      { tmdbId: 244786, kind: "tone", value: "tense", weight: 1, source: "curated" },
      { tmdbId: 244786, kind: "theme", value: "obsession and excellence", weight: 1, source: "curated" },
      { tmdbId: 244786, kind: "stakes", value: "psychological pressure", weight: 1, source: "curated" },
      { tmdbId: 244786, kind: "emotional_payoff", value: "ambiguous triumph", weight: 1, source: "curated" }
    ]
  },
  {
    tmdbId: 603692,
    title: "John Wick: Chapter 4",
    overview: "A legendary assassin battles his way through a global criminal order to win a path to freedom.",
    posterPath: "/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg",
    releaseDate: "2023-03-24",
    runtime: 170,
    voteAverage: 7.7,
    voteCount: 6500,
    popularity: 85,
    adult: false,
    genres: [
      { id: 28, name: "Action" },
      { id: 53, name: "Thriller" },
      { id: 80, name: "Crime" }
    ],
    keywords: ["assassin", "revenge", "underworld"],
    countries: ["US"],
    credits: { tmdbId: 603692, director: "Chad Stahelski", actors: ["Keanu Reeves", "Donnie Yen", "Bill Skarsgard"] },
    tasteFacts: [
      { tmdbId: 603692, kind: "pacing", value: "propulsive", weight: 1, source: "curated" },
      { tmdbId: 603692, kind: "structure", value: "ritualized combat gauntlet", weight: 1, source: "curated" },
      { tmdbId: 603692, kind: "emotional_payoff", value: "mythic release", weight: 0.9, source: "curated" },
      { tmdbId: 603692, kind: "protagonist", value: "stoic professional", weight: 0.9, source: "curated" }
    ]
  },
  {
    tmdbId: 324857,
    title: "Spider-Man: Into the Spider-Verse",
    overview: "A teenager learns to become Spider-Man with help from heroes pulled in from other dimensions.",
    posterPath: "/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    releaseDate: "2018-12-14",
    runtime: 117,
    voteAverage: 8.4,
    voteCount: 15500,
    popularity: 80,
    adult: false,
    genres: [
      { id: 16, name: "Animation" },
      { id: 28, name: "Action" },
      { id: 12, name: "Adventure" }
    ],
    keywords: ["hero", "coming of age", "multiverse", "family"],
    countries: ["US"],
    credits: { tmdbId: 324857, director: "Bob Persichetti, Peter Ramsey, Rodney Rothman", actors: ["Shameik Moore", "Jake Johnson", "Hailee Steinfeld"] },
    tasteFacts: [
      { tmdbId: 324857, kind: "theme", value: "coming of age", weight: 1, source: "curated" },
      { tmdbId: 324857, kind: "emotional_payoff", value: "uplifting catharsis", weight: 1, source: "curated" },
      { tmdbId: 324857, kind: "tone", value: "playful", weight: 0.9, source: "curated" },
      { tmdbId: 324857, kind: "structure", value: "chosen-one transformation", weight: 0.85, source: "curated" }
    ]
  },
  {
    tmdbId: 210577,
    title: "Gone Girl",
    overview: "A wife's disappearance turns a marriage into a media spectacle of lies, resentment, and performance.",
    posterPath: "/qymaJhucquUwjpb8oiqynMeXnID.jpg",
    releaseDate: "2014-10-03",
    runtime: 149,
    voteAverage: 7.9,
    voteCount: 18000,
    popularity: 55,
    adult: false,
    genres: [
      { id: 9648, name: "Mystery" },
      { id: 53, name: "Thriller" },
      { id: 18, name: "Drama" }
    ],
    keywords: ["marriage", "media", "deception", "crime"],
    countries: ["US"],
    credits: { tmdbId: 210577, director: "David Fincher", actors: ["Ben Affleck", "Rosamund Pike", "Neil Patrick Harris"] },
    tasteFacts: [
      { tmdbId: 210577, kind: "theme", value: "deception and identity", weight: 1, source: "curated" },
      { tmdbId: 210577, kind: "tone", value: "acidic", weight: 0.9, source: "curated" },
      { tmdbId: 210577, kind: "structure", value: "unreliable perspective", weight: 1, source: "curated" },
      { tmdbId: 210577, kind: "theme", value: "media spectacle", weight: 0.9, source: "curated" }
    ]
  }
];
