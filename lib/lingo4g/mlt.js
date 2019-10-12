`
`// * weight mlt query terms by label score? (to boost multi-word labels)
// * use min should match?
// * second-order mlt?
// * use topic labels for mltQuery?

const _ = require("lodash");

const DEFAULTS = {
  seed: {
    selector: {
      type: "byQuery",
      queryParser: "standard"
    }
  },
  mlt: {
    expansion: {
      type: "none",
      mlt: {
        result: {
          limit: 5,
          filter: { type: "byQuery", query: "", queryParser: "standard" }
        }
      }
    },
    criteria: {
      labels: {
        limit: 100,
        minMatching: 1,
        selection: "flat", // exemplars, flat
        aggregation: "all", // seed, similar, all
        weighting: "none", // word-count, none,
        expansion: {
          enabled: false,
          limit: 5
        },
        overrides: { }
      }
    },
    result: {
      scope: { type: "byQuery", query: "", queryParser: "standard" },
      fields: [],
      limit: 30,
      filter: { type: "byQuery", query: "", queryParser: "standard" },
      preserveSeed: true,
      docLabels: false
    }
  },
};


const MLT = function(api, defaults = DEFAULTS) {
  const EXPANDERS = {
    "none": function (seed) {
      return Promise.resolve(seed);
    },
    "mlt": function (seed, expansion) {
      return this
        .mlt({ seed: seed, mlt: expansion.mlt })
        .then(function (result) {
          return {
            limit: 2147483647,
            selector: {
              type: "byId",
              ids: result.mlt.list.map(d => d.id),
            }
          };
        });
    }.bind(this)
  };

  /**
   *
   */
  this.mlt = function(inputSpec) {
    const spec = _.merge({}, defaults, inputSpec);

    // First, expand the seed documents, if needed.

    return EXPANDERS[spec.mlt.expansion.type](spec.seed, spec.mlt.expansion)
      .then(fetchLabels)
      .then(addSimilarLabels)
      .then(startAnalysis)
      .then(fetchMlt)
      .then(fetchDocLabels)
      .catch(function (error) {
        console.log(error);
      });

    function fetchLabels (selector) {
      // Fetch labels based on the seed documents.
      const request = _.merge({}, spec.mlt.criteria.labels.overrides, {
        scope: selector,

        labels: {
          minLabels: spec.mlt.criteria.labels.limit,
          maxLabels: spec.mlt.criteria.labels.limit,
          frequencies: {
            minAbsoluteDf: 1,
            maxRelativeDf: 1
          },
          arrangement: {
            enabled: spec.mlt.criteria.labels.selection === "exemplars"
          }
        },
        documents: {
          arrangement: { enabled: false },
          embedding: { enabled: false }
        },

        summary: { labeledDocuments: false },
        output: {
          format: "json",
          labels: {
            enabled: true,
            documents: { enabled: false }
          },
          documents: {
            enabled: true,
            onlyWithLabels: false,
            labels: { enabled: false },
            content: {
              enabled: !_.isEmpty(spec.mlt.result.fields),
              fields: spec.mlt.result.fields
            }
          }
        }
      });

      return api.runAnalysisSync(request).then(prepareSeedLabels);

      function prepareSeedLabels(analysisResponse) {
        let labels;

        const analysisLabels = analysisResponse.body.labels;
        if (spec.mlt.criteria.labels.selection === "exemplars") {
          // Take only exemplar labels to build the MLT query.
          const labelsById = analysisLabels.list.reduce(function (map, label) {
            map[label.id] = label;
            return map;
          }, {});

          // Collect exemplars.
          labels = analysisLabels.arrangement.clusters.reduce(function flatten(list, cluster) {
            if (cluster.exemplar >= 0) {
              list.push(labelsById[cluster.exemplar]);
            }
            cluster.clusters.reduce(flatten, list);
            return list;
          }, []);
        } else {
          labels = analysisLabels.list.sort(function (a, b) {
            return b.score - a.score;
          });
        }

        return {
          analysisResponse: analysisResponse,
          seedLabels: labels.map(l => ({ text: l.text }))
        };
      }
    }

    function addSimilarLabels(seedLabelsResult) {
      if (spec.mlt.criteria.labels.expansion.enabled) {
        return Promise.all(
          seedLabelsResult.seedLabels.map(l => api.getSimilarLabels(l.text, spec.mlt.criteria.labels.expansion.limit))
        ).then(results => {
          const existingLabels = new Set(seedLabelsResult.seedLabels.map(l => l.text));
          const expandedLabels = seedLabelsResult.seedLabels.slice(0);
          const extraLabels = [];

          results.forEach(function (result) {
            result.body.matches.forEach(function (match) {
              if (!existingLabels.has(match.label)) {
                existingLabels.add(match.label);
                const label = { text: match.label };
                expandedLabels.push(label);
                extraLabels.push(label);
              }
            });
          });
          return ({
            analysisResponse: seedLabelsResult.analysisResponse,
            seedLabels: expandedLabels,
            seedLabelsOriginal: seedLabelsResult.seedLabels,
            seedLabelsExpansion: extraLabels
          });
        });
      } else {
        return seedLabelsResult;
      }
    }

    function startAnalysis(seedLabelsResult) {
      // Get the MLT documents. Since currently we don't have support for ad-hoc retrieval
      // of arbitrary documents, we'll trigger a dummy analysis with all docs in scope,
      // and use it as a base for the retrieval.
      const selectors = [
        spec.mlt.result.scope,
        spec.mlt.result.filter,
      ];
      if (!spec.mlt.result.preserveSeed) {
        selectors.push({
          type: "complement",
          selector: spec.seed.selector
        });
      }

      return api.startAnalysis(_.merge({}, spec.mlt.criteria.labels.overrides, {
        scope: {
          // lift the limit, otherwise we'll be selecting from a truncated list of documents
          limit: 2147483647,
          selector: {
            type: "composite",
            operator: "AND",
            selectors: selectors
          }
        },
        labels: { maxLabels: 0, arrangement: { enabled: false } },
        documents: {
          arrangement: { enabled: false },
          embedding: { enabled: false }
        },

        summary: { labeledDocuments: false },
        output: {
          format: "json",
          labels: { enabled: false },
          documents: { enabled: false }
        }
      })).then(function (response) {
        return {
          seedLabels: seedLabelsResult.seedLabels,
          seedLabelsOriginal: seedLabelsResult.seedLabelsOriginal,
          seedLabelsExpansion: seedLabelsResult.seedLabelsExpansion,
          seedDocs: seedLabelsResult.analysisResponse.body.documents,
          analysisResponse: response
        };
      });
    }

    function fetchMlt(input) {
      // Build MLT query and retrieve the documents.
      const analysisResultUrl = input.analysisResponse.header.location;
      const analysisId = analysisResultUrl.substring(analysisResultUrl.lastIndexOf("/") + 1);

      let labels = input.seedLabels;
      switch (spec.mlt.criteria.labels.aggregation) {
        case "seed":
          labels = input.seedLabelsOriginal || input.seedLabels;
          break;

        case "similar":
          labels = input.seedLabelsExpansion || input.seedLabels;
          break;

        case "all":
        default:
          labels = input.seedLabels;
      }
      let weights;
      switch (spec.mlt.criteria.labels.weighting) {
        case "word-count":
          weights = labels.map(l => l.text.split(/ /).length);
          break;

        case "none":
        default:
          weights = null;
      }

      // Fetch the documents and form the final result object.
      const mltCriteria = {
        type: "forLabels",
        labels: labels.map(l => l.text),
        weights: weights,
        operator: "OR",
        minOrMatches: spec.mlt.criteria.labels.minMatching
      };
      return api.getAnalysisDocuments(analysisId, {
        limit: spec.mlt.result.limit,
        selector: mltCriteria,
        labels: {
          enabled: false
        },
        content: {
          enabled: true,
          fields: spec.mlt.result.fields
        }
      }).then(function (response) {
        // Form the final response
        return {
          seeds: input.seedDocs,
          mlt: response.body,
          labels: labels,
          labelsOriginal: input.seedLabelsOriginal,
          labelsExpansion: input.seedLabelsExpansion,
          spec: spec,
          docFetchingCriteria: mltCriteria,
          docFetchingAnalysisId: analysisId
        };
      });
    }

    function fetchDocLabels(mltResult) {
      if (spec.mlt.result.docLabels) {
        const mltAndSeedDocs = mltResult.mlt.list.concat(mltResult.seeds.list);
        const mltDocsById = mltAndSeedDocs.reduce((map, d) => { map.set(d.id, d); return map; }, new Map());
        return Promise.all(
          mltAndSeedDocs.map(
            doc => fetchLabels({ selector: { type: "byId", ids: [ doc.id ] }})
              .then(function (labelsResponse) {
                labelsResponse.analysisResponse.body.documents.list.forEach(function (doc) {
                  mltDocsById.get(doc.id).labels = labelsResponse.seedLabels
                });
              })
          )
        ).then(function () {
          return mltResult;
        });
      } else {
        return mltResult;
      }
    }
  };
};

module.exports = MLT;