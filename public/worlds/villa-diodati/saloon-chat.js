// ThirdRoom WebSG script: a fixed, in-world side transcript for the saloon.
// Install through the world's Script settings or the in-world editor.

const transcript = [
  {
    speaker: "LORD BYRON",
    color: [0.88, 0.62, 0.38, 1],
    text: "This rain has made a prison of the villa.",
  },
  {
    speaker: "MARY SHELLEY",
    color: [0.82, 0.78, 0.66, 1],
    text: "Then let us make something worth staying in for.",
  },
  {
    speaker: "PERCY BYSSHE SHELLEY",
    color: [0.68, 0.78, 0.61, 1],
    text: "A thought can travel farther than any of us tonight.",
  },
  {
    speaker: "CLAIRE CLAIRMONT",
    color: [0.83, 0.61, 0.58, 1],
    text: "Only if someone is brave enough to begin it.",
  },
  {
    speaker: "JOHN POLIDORI",
    color: [0.63, 0.76, 0.83, 1],
    text: "Very well. Let us give the darkness a voice.",
  },
];

function makeMessage(message, index) {
  const card = world.createUIElement({
    width: 664,
    padding: [14, 16, 13, 16],
    margin: [0, 0, 14, 0],
    flexDirection: "column",
    backgroundColor: index % 2 === 0
      ? [0.15, 0.12, 0.10, 0.96]
      : [0.19, 0.15, 0.12, 0.96],
    borderColor: [0.38, 0.29, 0.18, 1],
    borderWidth: [1, 1, 1, 1],
    borderRadius: [5, 5, 5, 5],
  });

  card.addChild(world.createUIText({
    value: message.speaker,
    width: 632,
    height: 28,
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "bold",
    color: message.color,
  }));

  card.addChild(world.createUIText({
    value: message.text,
    width: 632,
    height: 58,
    margin: [4, 0, 0, 0],
    fontFamily: "serif",
    fontSize: 22,
    color: [0.91, 0.87, 0.78, 1],
  }));

  return card;
}

world.onload = () => {
  const panel = world.createUIElement({
    width: 720,
    height: 1120,
    padding: [24, 24, 20, 24],
    flexDirection: "column",
    backgroundColor: [0.075, 0.060, 0.050, 0.94],
    borderColor: [0.57, 0.42, 0.22, 1],
    borderWidth: [3, 3, 3, 3],
    borderRadius: [8, 8, 8, 8],
  });

  panel.addChild(world.createUIText({
    value: "VILLA DIODATI",
    width: 664,
    height: 42,
    fontFamily: "serif",
    fontSize: 29,
    fontWeight: "bold",
    color: [0.86, 0.72, 0.49, 1],
  }));

  panel.addChild(world.createUIText({
    value: "SALON TRANSCRIPT  ·  STORMY EVENING, 1816",
    width: 664,
    height: 32,
    margin: [0, 0, 14, 0],
    fontFamily: "sans-serif",
    fontSize: 15,
    fontWeight: "bold",
    color: [0.68, 0.62, 0.51, 1],
  }));

  panel.addChild(world.createUIElement({
    width: 664,
    height: 2,
    margin: [0, 0, 18, 0],
    backgroundColor: [0.57, 0.42, 0.22, 1],
  }));

  transcript.forEach((message, index) => panel.addChild(makeMessage(message, index)));

  panel.addChild(world.createUIText({
    value: "A staged conversation for the room — not a film quotation or historical transcript.",
    width: 664,
    height: 44,
    margin: [5, 0, 0, 0],
    fontFamily: "serif",
    fontStyle: "italic",
    fontSize: 15,
    color: [0.65, 0.60, 0.51, 1],
  }));

  const canvas = world.createUICanvas({
    width: 720,
    height: 1120,
    size: [1.52, 2.37],
    root: panel,
  });

  const panelNode = world.createNode();
  // On the right-hand wall, turned toward the room's center.
  panelNode.translation.x = 5.50;
  panelNode.translation.y = 2.16;
  panelNode.translation.z = 2.52;
  panelNode.rotation.y = -Math.SQRT1_2;
  panelNode.rotation.w = Math.SQRT1_2;
  panelNode.uiCanvas = canvas;
  world.environment.addNode(panelNode);
  canvas.redraw();
};
