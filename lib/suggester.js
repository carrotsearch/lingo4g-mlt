const _ = require("lodash");

const Suggester = function (mlt) {
  this.suggest = function (specIn) {
    const query = specIn.suggestions.query;
    const suggestField = specIn.suggestions.field;
    const spec = _.merge({}, specIn, {
      seed: {
        selector: {
          query: query
        }
      },
      mlt: {
        result: {
          scope: {
            type: "byQuery",
            query: "(" + suggestField + ":[* TO *] AND NOT (" + query + "))" +
            (specIn.suggestions.mltFilterQuery ? " AND (" + specIn.suggestions.mltFilterQuery + ")" : "")
          },
          fields: [ { name: suggestField, maxValues: 1000 } ]
        }
      }
    });

    return mlt.mlt(spec).then(function (result) {
      return new Suggestions(result);
    });
  };
};

const Suggestions = function(result) {
  this.docs = result.seeds;
  this.mltDocs = result.mlt.list;
  this.result = result;

  this.suggestions = function (maxSuggestions, selectByCount, maxMltDocs) {
    const suggestedValues = result.mlt.list
      .slice(0, maxMltDocs || Number.MAX_VALUE)
      .reduce(function (map, d) {
        d.content[0].values.forEach(function (r) {
          if (map[r] === undefined) {
            map[r] = { count: 1, score: d.score };
          } else {
            map[r].count++;
            map[r].score += d.score;
          }
        });
        return map;
      }, {});

    return Object.keys(suggestedValues)
      .filter(r => suggestedValues[r].count > 1)
      .map(r => ({ value: r, count: suggestedValues[r].count, score: suggestedValues[r].score }))
      .sort(selectByCount ?
        function (a, b) {
          return b.count - a.count;
        } :
        function (a, b) {
          return b.score - a.score;
        })
      .slice(0, maxSuggestions);
  };
};

module.exports = Suggester;

