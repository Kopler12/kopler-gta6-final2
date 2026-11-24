// shots.js — deterministic staged scenes for the four screenshots.
// Each scene puts the player, traffic, police and HUD into a composed shot
// that shows several systems at once. Driven by ?shot=cover|drive|chase|mission
// and a seed, so the screenshots are reproducible renders of the real game.

export function applyShot(api, name) {
  api.startGame();
  api.clearPolice();
  if (name === 'cover') {
    // City + car + HUD + minimap + wanted stars: the hero shot.
    api.setMission(0);
    api.placeCarAt(0, -30, Math.PI / 2, 0);
    api.setWantedStars(2);
    api.spawnPolice(2, 18);
    api.placePoliceAhead(30);
    api.spawnTrafficNear(4, 0, -30, 50);
    api.setCamera(0, 0.3, 11);
    api.setClock(1122); // golden-hour 18:42
  } else if (name === 'drive') {
    // Driving fast through traffic on the main avenue.
    api.setMission(1);
    api.placeCarAt(-40, 0, Math.PI / 2, 0);
    api.spawnTrafficNear(6, -10, 0, 60);
    api.setCamera(0, 0.28, 14);
    api.setClock(1122);
  } else if (name === 'chase') {
    // Full police pursuit at four stars.
    api.setMission(4);
    api.placeCarAt(0, 30, 0, 0);
    api.setWantedStars(4);
    api.spawnPolice(4, 12);
    api.spawnTrafficNear(3, 10, 30, 50);
    // Camera in front of the car, looking back: the player car in the
    // foreground with the pursuing police cars closing in behind it.
    api.setCamera(-Math.PI, 0.35, 16);
    api.setClock(1140);
  } else if (name === 'mission') {
    // On foot at the pier, rivals in view, mission objective on the HUD.
    api.setMission(2);
    api.placeOnFoot(126, -30, Math.PI / 2);
    api.spawnRivalsAtPier();
    api.setWantedStars(1);
    api.setCamera(0.1, 0.35, 13);
    api.setClock(1155);
  }
  api.updateHud(true);
}
