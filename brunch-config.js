var exec = require("child_process").exec;

var preCompile = function (end) {
    exec("./precompile.sh");
    end();
};

module.exports = {
  paths: {
    watched: [ 'client', 'common' ]
  },
  files: {
    javascripts: { joinTo: "app.js" },
    stylesheets: { joinTo: "app.css" },
    templates: { joinTo: "app.js" }
  },
  hooks: {
    preCompile: preCompile
  },
  preCompile: preCompile,
  overrides: {
    production: {
      sourceMaps: true,
      optimize: false
    }
  }
}
