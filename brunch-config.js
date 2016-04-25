module.exports = {
  paths: {
    watched: [ 'app', 'common' ]
  },
  files: {
    javascripts: { joinTo: "app.js" },
    stylesheets: { joinTo: "app.css" },
    templates: { joinTo: "app.js" }
  },
  overrides: {
    production: {
      sourceMaps: true,
      optimize: false
    }
  }
}
