const createCombos = (parameters) => {
  const combos = [];

  const generate = (currentCombo, depth) => {
    if (depth === parameters.length) {
      combos.push(currentCombo);
      return;
    }

    const { alias, values } = parameters[depth];
    values.forEach((value) => {
      generate({ ...currentCombo, [alias]: value }, depth + 1);
    });
  };

  generate({}, 0);
  return combos;
};

module.exports = {
  createCombos,
}