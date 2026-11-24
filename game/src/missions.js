// missions.js — the story of San Verano: five sequential missions for Rio
// Vega, then free-roam taxi fares after the story. Each mission has a title,
// objective text, a world marker position and a completion check; the main
// loop asks for the current objective and advances it on completion.

export const MISSION_DEFS = [
  {
    id: 1, title: 'First Shift',
    intro: 'Mara Solis needs her delivery van moved. Get to the garage and take the blue coupe.',
    objective: 'Go to Mara\'s Garage',
    target: { x: -75, z: -60 },
    reward: 150,
    completeWhen: (s) => s.inCar,
    completeText: 'Nice wheels. Mara is impressed.',
  },
  {
    id: 2, title: 'Harbour Pickup',
    intro: 'Dario Finn is waiting at the harbour with a package. Drive to the crates and pick him up.',
    objective: 'Drive to the Harbour',
    target: { x: 112, z: 20 },
    reward: 300,
    completeWhen: (s) => s.nearTarget,
    completeText: 'Package secured. Dario owes you one.',
  },
  {
    id: 3, title: 'Pier Shootout',
    intro: 'Rivals ambushed the pier deal. Get to the pier on foot and clear them out.',
    objective: 'Clear the rivals at the Pier',
    target: { x: 132, z: -30 },
    reward: 500,
    spawnRivals: true,
    completeWhen: (s) => s.rivalsCleared,
    completeText: 'Pier is ours. The crew talks about you now.',
  },
  {
    id: 4, title: 'Neon Run',
    intro: 'A street race across the city, plaza to beach. Beat the clock — 75 seconds.',
    objective: 'Race to the Beach (75s)',
    target: { x: 118, z: 60 },
    reward: 750,
    timer: 75,
    completeWhen: (s) => s.nearTarget,
    failWhen: (s) => s.missionTime > 75,
    completeText: 'Fastest wheels on the coast. Unbelievable run.',
  },
  {
    id: 5, title: 'The Big Score',
    intro: 'One last job: grab the cash at the plaza fountain, then lose the heat and bring it home to Mara.',
    objective: 'Grab the cash at the Plaza',
    target: { x: 0, z: 0 },
    reward: 1500,
    twoStage: true,
    completeWhen: (s) => s.nearTarget,
    completeText: 'The score is done. San Verano is yours, Rio.',
  },
];

export class MissionManager {
  constructor() {
    this.index = 0;            // 0-based into MISSION_DEFS
    this.active = false;
    this.stage = 0;            // for two-stage missions
    this.missionTime = 0;
    this.done = false;
    this.fare = null;          // active taxi fare after the story
    this.fareTimer = 0;
  }

  get current() { return MISSION_DEFS[this.index] || null; }
  get storyDone() { return this.index >= MISSION_DEFS.length; }

  startMission(i) {
    this.index = i;
    this.active = true;
    this.stage = 0;
    this.missionTime = 0;
    this.done = false;
    return this.current;
  }

  // Advance the story. Returns the completed mission def, or null.
  completeMission() {
    const m = this.current;
    this.index++;
    this.active = false;
    this.done = this.storyDone;
    return m;
  }

  // Taxi fares after the story: pick up a fare, drive them to a random spot.
  startFare(rng) {
    const spots = [
      { x: -75, z: -60, name: "Mara's Garage" },
      { x: 112, z: 20, name: 'Harbour' },
      { x: 118, z: 60, name: 'Beach' },
      { x: 0, z: 0, name: 'Plaza' },
      { x: -60, z: 60, name: 'South Market' },
      { x: 60, z: -60, name: 'North Docks' },
    ];
    const dest = spots[Math.floor(rng() * spots.length)];
    this.fare = { dest, reward: 80 + Math.floor(rng() * 120), timer: 90 };
    this.fareTimer = 0;
    return this.fare;
  }

  objectiveText() {
    if (this.fare) return `Taxi fare: take the passenger to ${this.fare.dest.name} ($${this.fare.reward})`;
    const m = this.current;
    if (!m) return 'Free roam — press M for a taxi fare';
    if (m.twoStage && this.stage === 1) return 'Bring the cash home to Mara\'s Garage';
    return m.objective;
  }

  targetPos() {
    if (this.fare) return this.fare.dest;
    const m = this.current;
    if (!m) return null;
    if (m.twoStage && this.stage === 1) return { x: -75, z: -60 };
    return m.target;
  }
}
