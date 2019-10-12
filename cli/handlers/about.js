const _       = require("lodash");
const Lingo4G = require("../../lib/lingo4g/api");

const AboutHandler = function (api, debug) {
  const l4g = new Lingo4G(api || "http://localhost:8080/api/v1", debug);
  const paramShorthands = {
  };

  this.init = function () {
    return Promise.resolve();
  };

  this.handle = function(params, format) {
    return l4g.about().then(function (resp) {
      return resp.text;
    });
  };

  this.params = function() {
    return paramShorthands;
  };

  this.description = function () {
    return "Retrieves information about the underlying Lingo4G API version.";
  };

  this.examples = function () {
    return [
    ];
  };
};

module.exports = AboutHandler;