const parameters = [{
  alias: 'quoiqui',
  values: ["plombier", "electricien", "jardinier"],
},
{
  alias: 'ou',
  values: ["normandie", "paris", "lyon", "marseille"],
},
];

const baseUrl = 'https://pagesjaunes.fr/annuaire/chercherlespros';

module.exports = { parameters, baseUrl };