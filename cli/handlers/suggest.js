const _           = require("lodash");
const Suggester   = require("../../lib/suggester");
const MLT         = require("../../lib/lingo4g/mlt");
const Lingo4G     = require("../../lib/lingo4g/api");

const config      = require("./suggest.json");

const SuggestHandler = function (api, debug) {
  const lingo4g = new Lingo4G(api || "http://localhost:8080/api/v1", debug);
  const mlt = new MLT(lingo4g);
  const suggester = new Suggester(mlt);
  const paramShorthands = {
    "id":                   { required: true,  path: "suggestions.query", transform: q => "id:" + q, description: "ID of the document for which to suggest field values." },
    "maxSuggestions":       { required: false, path: "suggestions.limit", description: "Maximum number of suggestions to produce." },
    "mltFilterQuery":       { required: false, path: "suggestions.mltFilterQuery", description: "Additional filter query to exclude certain documents from the similar documents set used to derive field suggestions." },
    "mltMaxDocs":           { required: false, path: "mlt.result.limit", description: "Size of the similar documents set used to derive field suggestions." },
    "mltMaxLabels":         { required: false, path: "mlt.criteria.labels.limit", description: "Maximum number of labels to use to generate similar documents set." },
    "mltLabelSelection":    { required: false, path: "mlt.criteria.labels.selection", description: "Which labels to use to build MLT query. Allowed values: 'flat' (uses the complete label list), 'exemplars' (uses only labels selected as label cluster exemplars)." },
    "mltSeedExpansion":     { required: false, path: "mlt.expansion.type", transform: v => v ? "mlt" : "none", description: "Expand the seed documents by adding a number of similar documents to them." },
    "mltSeedExpansionDocs": { required: false, path: "mlt.expansion.mlt.result.limit", description: "The number of expansion documents to add to seed documents." },
    "labelExpansion":       { required: false, path: "mlt.criteria.labels.expansion.enabled", description: "Expand MLT label set by adding similar labels." },
    "labelExpansionLimit":  { required: false, path: "mlt.criteria.labels.expansion.limit", description: "The number of similar labels to add for each original MLT label." },
    "selectByCount":        { required: false, path: "suggestions.selectByCount", description: "Use document count rather than score to select suggested field values." }
  };

  const formatters = {
    json: function (request, result, format) {
      return JSON.stringify({
        suggestions: result,
        spec: request
      });
    },
    csv: function (request, result, format) {
      const fields = request.output.fields;
      const suggestionField = request.suggestions.field;

      // Output headers
      let output = "";
      if (format.header) {
        output += `ID\tSuggested ${suggestionField}\tScore\tCount\tOccurrences\t` + fields.join("\t") + "\n";
      }

      const id = request.suggestions.query.substring("id:".length);

      return result.reduce(function (output, s) {
        return output +
            `${id}\t${s.value}\t${s.score.toFixed(2)}\t${s.count}\t${s.occurrences}\t` +
            s.fields.join("\t") + "\n";
      }, output);
    }
  };

  this.init = function (quiet) {
    return Promise.resolve();
  };

  this.handle = function(params, format) {
    const request = _.merge({}, config);

    for (let p of Object.keys(params)) {
      const def = paramShorthands[p];
      if (!def) {
        throw `Unknown parameter shorthand: ${p}.`;
      }
      const fn = def.transform || _.identity;
      _.set(request, def.path, fn(params[p]));
    }

    return suggester
      .suggest(request)
      .then(function (result) {
        const suggestions = result.suggestions(request.suggestions.limit, request.suggestions.selectByCount);
        const suggestField = request.suggestions.field;
        const fields = request.output.fields;

        let promise = Promise.resolve(suggestions);
        suggestions.forEach(function (s) {
          promise = promise.then(function () {
            return lingo4g.getAnalysisDocuments(result.result.docFetchingAnalysisId, {
              limit: 1,
              selector: {
                type: "byQuery",
                queryParser: "standard",
                query: suggestField + ":\"" + s.value + "\""
              },
              content: {
                enabled: true,
                fields: [suggestField, ...fields ].map(field => ({ name: field, maxValues: 2 << 29 }))
              }
            }).then(function (response) {
              s.occurrences = response.body.matches;

              // Find the specific field value.
              const doc = response.body.list[0];
              const index = doc.content.find(c => c.name === suggestField).values.findIndex(v => v === s.value);
              if (index >= 0) {
                s.fields = fields.map(function (fieldName) {
                  return doc.content.find(c => c.name === fieldName).values[index];
                });
              } else {
                s.fields = fields.map(() => "n/a");
              }

              return suggestions;
            });
          });
        });
        return promise;
      })
      .then(function (suggestions) {
        const formatter = formatters[format.type] || formatters.json;
        return formatter(request, suggestions, format);
      })
      .catch(function (error) {
        console.log("Processing failed:", error.toString(), error);
      });
  };

  this.params = function() {
    return paramShorthands;
  };

  this.description = function () {
    return "Given a document, produces a list of field value suggestions based on textual similarity.";
  };

  this.examples = function () {
    return [
      { params: { id: "1302.1612" }, description: "Returns suggestions for paper 1302.1612." },
      {
        params: {
          id: "1302.1612",
          mltSeedExpansion: true
        },
        description: "Retrieves field suggestions with seed document expansion enabled. Compared to the default setting, the list of suggested field values will cover a broader thematic area."
      }
    ];
  };
};

module.exports = SuggestHandler;
