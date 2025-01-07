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
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

module.exports = { parameters, baseUrl, userAgent };