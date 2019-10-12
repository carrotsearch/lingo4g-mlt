const _       = require("lodash");
const Lingo4G = require("../../lib/lingo4g/api");

const EmbeddingsHandler = function (api, debug) {
  const l4g = new Lingo4G(api || "http://localhost:8080/api/v1", debug);
  const paramShorthands = {
    "label": { required: true, path: "label", description: "Label for which to fetch similar labels." },
    "limit": { required: false, path: "limit", description: "How many similar labels to fetch." },
    "slowBruteForce": { required: false, path: "slowBruteForce", description: "Use the orders of magnitude slower searching method, which may (in <0.5% cases) provide more accurate results." }
  };

  this.init = function () {
    return Promise.resolve();
  };

  this.handle = function(params, format) {
    return l4g.getSimilarLabels(params.label, params.limit, params.slowBruteForce).then(function (resp) {
      if (format.type === "csv") {
        return "Similarity\tLabel\n" +
                resp.body.matches.map(m => `${m.similarity.toFixed(4)}\t${m.label}`).join("\n");
      } else {
        return resp.text;
      }
    });
  };

  this.params = function() {
    return paramShorthands;
  };

  this.description = function () {
    return "Queries label embeddings for labels similar to the provided one.";
  };

  this.examples = function () {
    return [
      {
        params: { label: "clustering algorithms" },
        description: "Returns labels similar to 'clustering algorithms'."
      }
    ];
  };
};

module.exports = EmbeddingsHandler;