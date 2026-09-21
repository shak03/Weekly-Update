// ============================================================================
// CCFF Weekly Recap — league configuration
// This is the only file you should ever need to touch week-to-week.
// ============================================================================

export const LEAGUE_ID = "1398034562679869441";
export const LEAGUE_NAME = "CCFF";

// ---------------------------------------------------------------------------
// Sleeper handle -> real manager name.
// Matched case-insensitively against each roster owner's display_name AND
// username, so either works. This manual pin is what keeps @Lilb15, @Jpeeler0
// and the two Hoffman handles from misrouting. If someone changes their
// Sleeper name mid-season, just fix it here.
// ---------------------------------------------------------------------------
export const HANDLE_TO_MANAGER = {
  shak03: "Josh Ishak",
  emobley: "Evan Mobley",
  aidank2247: "Aidan Kraf",
  cadehoff: "Cade Hoffman",
  jhoffff: "Jace Hoffman",
  bryjuan11: "Bryson Oaks",
  brettmobley: "Brett Mobley",
  jpeeler0: "Jack Peeler",
  joeywey: "Joey Wey",
  lilb15: "Cooper Barno",
};

// ---------------------------------------------------------------------------
// Game of the Week schedule. week -> [managerA, managerB], or null for TBD.
// Weeks 1 and 4 are handled as special themed weeks below, not here.
// Fill in Week 13 once the league decides.
// ---------------------------------------------------------------------------
export const GAME_OF_THE_WEEK = {
  2: ["Joey Wey", "Cooper Barno"],
  3: ["Josh Ishak", "Aidan Kraf"],
  5: ["Josh Ishak", "Brett Mobley"],
  6: ["Evan Mobley", "Cooper Barno"],
  7: ["Jack Peeler", "Aidan Kraf"],
  8: ["Jack Peeler", "Cade Hoffman"],
  9: ["Cade Hoffman", "Evan Mobley"],
  10: ["Bryson Oaks", "Jace Hoffman"],
  11: ["Jace Hoffman", "Brett Mobley"],
  12: ["Joey Wey", "Bryson Oaks"],
  13: null, // TBD by the league
};

// Special themed weeks (no single featured game — spotlight the slate instead).
export const SPECIAL_WEEKS = {
  1: {
    kind: "bowl",
    title: "Bowl Game Week",
    bowls: [
      { name: "Ogre Bowl", teams: ["Aidan Kraf", "Bryson Oaks"] },
      { name: "Hoffman Bowl", teams: ["Cade Hoffman", "Jace Hoffman"] },
      { name: "Mobley Bowl", teams: ["Evan Mobley", "Brett Mobley"] },
      { name: "David and Goliath Bowl", teams: ["Cooper Barno", "Josh Ishak"] },
      { name: "Pumbaa and Timon Bowl", teams: ["Jack Peeler", "Joey Wey"] },
    ],
  },
  4: {
    kind: "rivalry",
    title: "Rivalry Week",
  },
};

// ---------------------------------------------------------------------------
// Rivalry context — fed to the AI so it can find the juice in a slate.
// These mirror the Week 4 Rivalry Week slate (the league's declared rivalries),
// not the brother pairings. Update here if the league re-picks rivals.
// ---------------------------------------------------------------------------
export const RIVALRIES = [
  ["Jack Peeler", "Evan Mobley"],
  ["Joey Wey", "Jace Hoffman"],
  ["Josh Ishak", "Bryson Oaks"],
  ["Aidan Kraf", "Cooper Barno"],
  ["Brett Mobley", "Cade Hoffman"],
];

// ---------------------------------------------------------------------------
// Tunable thresholds (points). Adjust to taste.
// ---------------------------------------------------------------------------
export const BLOWOUT_MARGIN = 40; // margin >= this  -> 💥 blowout
export const NAILBITER_MARGIN = 8; // margin <= this  -> 😬 nail-biter

// Last completed regular-season week we'll ever show. Bump if your regular
// season runs long; the tool also never shows a week past Sleeper's current.
export const LAST_REGULAR_WEEK = 13;
