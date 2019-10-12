const _       = require("lodash");
const Lingo4G = require("../../lib/lingo4g/api");
const MLT     = require("../../lib/lingo4g/mlt");
const config  = require("./mlt.json");
const csv = require("./csv.json");

const MLTHandler = function (api, debug) {
  const mlt = new MLT(new Lingo4G(api || "http://localhost:8080/api/v1", debug));
  const paramShorthands = {
    "seedQuery":         { required: true, path: "seed.selector.query", description: "Query that select seed document(s) for which to find the similar documents." },
    "filterQuery":       { required: false, path: "mlt.result.filter.query", description: "Additional filter query to apply to the result. You can use it to restrict the results to, for example, documents having a specific field value." },
    "preserveSeed":      { required: false, path: "mlt.result.preserveSeed", description: "If true, preserves seed documents in the result.", transform: booleanOrString },
    "maxDocs":           { required: false, path: "mlt.result.limit", description: "Maximum number of similar documents to fetch." },
    "maxLabels":         { required: false, path: "mlt.criteria.labels.limit", description: "Maximum number of labels to use to find similar documents." },
    "minLabelsMatching": { required: false, path: "mlt.criteria.labels.minMatching", description: "Minimum number of MLT query labels each MLT document must contain." },
    "outputMltLabels":   { required: false, path: "mlt.result.mltLabels", transform: booleanOrString, description: "Include in output labels used to generate MLT queries." },
    "outputDocLabels":   { required: false, path: "mlt.result.docLabels", transform: booleanOrString, description: "Output top labels for each MLT doc." },
    "seedExpansion":     { required: false, path: "mlt.expansion.type", transform: v => v ? "mlt" : "none", description: "Expand the seed documents by adding similar documents." },
    "seedExpansionDocs": { required: false, path: "mlt.expansion.mlt.result.limit", description: "The number of similar expansion documents to add to seed documents during seed expansion." },
    "seedExpansionFilterQuery": { required: false, path: "mlt.expansion.mlt.result.filter.query", description: "Additional filter query to apply to the documents expanding the seed. You can use it to exclude certain documents from the expanded seed." },
    "labelExpansion":    { required: false, path: "mlt.criteria.labels.expansion.enabled", transform: booleanOrString, description: "Expand MLT label set by adding similar labels." },
    "labelExpansionLimit": { required: false, path: "mlt.criteria.labels.expansion.limit", description: "The number of similar labels to add for each original MLT label." },
    "labelSelection":    { required: false, path: "mlt.criteria.labels.selection", description: "Which labels to use to build MLT query. Allowed values: 'flat' (uses the complete label list), 'exemplars' (uses only labels selected as label cluster exemplars)." },
    "labelAggregation": { required: false, path: "mlt.criteria.labels.aggregation", description: "How to combine seed and similar labels for MLT query. Allowed values: 'seed' (use only seed labels), 'similar' (use only similar labels), 'all' (use both seed and similar labels)"}
  };

  function booleanOrString(v) {
    return _.isBoolean(v) ? v : (v || "true").toLowerCase() === "true";
  }

  const formatters = {
    json: function (request, result, format) {
      return JSON.stringify({
        seeds: result.seeds,
        mlt: result.mlt,
        labels: result.labels,
        spec: result.spec,
      });
    },
    csv: function (request, result, format) {
      const fields = request.mlt.result.fields.map(f => f.name);
      const docLabels = request.mlt.result.docLabels;

      // Output headers
      let output = "";
      if (format.header) {
        output += "type\tscore\t" + fields.join("\t") + (docLabels ? "\tlabels" : "") + "\n";
      }
      const outputDocs = output +
        documentsCsv(result.seeds.list, "seed") +
        documentsCsv(result.mlt.list, "mlt");
      if (debug) {
        console.log("CSV docs output:");
        console.log(outputDocs);
      }

      const outputLabels = (request.mlt.result.mltLabels ? "labels\t" + mltLabelsCvs(result.labelsOriginal || result.labels) : "");
      if (debug) {
        console.log("CSV labels output:");
        console.log(outputLabels);
      }

      const outputSimilarLabels = (request.mlt.result.mltLabels && result.labelsExpansion ? "\nsimilar labels\t" + mltLabelsCvs(result.labelsExpansion) : "");

      return outputDocs + outputLabels + outputSimilarLabels;

      function documentCsv(doc, outputLine) {
        const maxValues = doc.content.reduce(function (max, a) {
          return Math.max(max, a.values.length);
        }, 0);

        for (let i = 0; i < maxValues; i++) {
          // Skip the artificial ellipsis marker field value …
          const markerValue = fields.reduce(function (markerValue, fieldName) {
            if (markerValue) {
              return true;
            }
            const values = Lingo4G.documentField(doc, fieldName);
            return (values && values[i] === "…");
          }, false);
          if (markerValue) {
            continue;
          }

          const line = fields.map(function (fieldName) {
            const values = Lingo4G.documentField(doc, fieldName);
            if (csv.repatFieldInEachRow && csv.repatFieldInEachRow[fieldName]) {
              if (values) {
                if (values.length !== 1) {
                  return "?more than one value?";
                } else {
                  return values[0];
                }
              } else {
                return "";
              }
            }
            return (values && values[i]) || "";
          });
          line.unshift(doc.score || "");
          if (docLabels && doc.labels) {
            line.push(mltLabelsCvs(doc.labels));
          }

          outputLine(line);
        }
      }

      function documentsCsv(docs, type) {
        let output = "";
        docs.forEach(function (mltDoc) {
          documentCsv(mltDoc, function (line) {
            output += type + "\t" + line.join("\t").replace(/\n/g, "") + "\n";
          });
        });
        return output;
      }

      function mltLabelsCvs(labels) {
        return (labels.map(l => l.text).join(", "));
      }
    }
  };

  this.init = function () {
    return Promise.all([
      Promise.resolve(config),
      Promise.resolve(csv)
    ]);
  };

  this.handle = function(params, format) {
    if (debug) {
      console.log("MLT request:");
      console.log(JSON.stringify(params, null, 2));
      console.log("Output format: ", format);
    }
    const request = _.merge({}, config);

    for (let p of Object.keys(params)) {
      const def = paramShorthands[p];
      if (!def) {
        throw `Unknown parameter shorthand: ${p}.`;
      }
      const fn = def.transform || _.identity;
      _.set(request, def.path, fn(params[p]));
    }

    return mlt.mlt(request).then(function (result) {
      const formatter = formatters[format.type] || formatters.json;
      return formatter(request, result, format);
    });
  };

  this.params = function() {
    return paramShorthands;
  };

  this.description = function () {
    return "Retrieves documents similar to one or more provided seed documents (More Like This).";
  };

  this.examples = function () {
    return [
      {
        params: { seedQuery: "id:1105.5789" },
        description: "Returns documents similar to paper 1105.5789."
      },
      {
        params: { seedQuery: "title:(document clustering)" },
        description: "Returns papers similar to papers containing 'document' and 'clustering' in their titles."
      }
    ];
  };
};

module.exports = MLTHandler;