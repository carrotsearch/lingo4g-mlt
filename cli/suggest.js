process.on('uncaughtException', function (err) {
  console.log(err);
});

const program = require('commander');
const _ = require("lodash");
const SuggestHandler = require('./handlers/suggest');


program
  .version("0.0.1") // TODO: replace this during build
  .usage('[options] <id ...>')
  .option('-q, --quiet', 'Suppress information messages.')
  .option('--max-suggestions <n>', 'Maximum number of suggestions to produce.', parseInt)
  .option('--select-by-count', 'Use document count rather than score to compute suggestions.')
  .option('--mlt-max-docs <n>', 'Maximum number of similar documents to fetch.', parseInt)
  .option('--mlt-max-labels <n>', 'Maximum number of labels to use to find similar documents.', parseInt)
  .option('--mlt-seed-expansion', 'Expand the seed documents by adding similar documents.')
  .option('--mlt-seed-expansion-docs', 'The number of similar expansion documents to add to seed.', parseInt)
  .option('--mlt-filter-query <s>', 'Additional filter query to exclude certain documents from MLT set.')
  .option('--mlt-label-selection <s>', "Which labels to use to build MLT query. Allowed values: 'flat' (uses the complete label list), 'exemplars' (uses only labels selected as label cluster exemplars).")
  .option('--label-expansion', 'Expand MLT label set by adding similar labels.')
  .option('--label-expansion-limit', 'The number of similar labels to add.', parseInt)
  .option('--api [api-url-base]', 'The base URL of Lingo4G REST API.')
  .parse(process.argv);

const params = _.pick(program, [
  "maxSuggestions", "mltFilterQuery", "mltMaxDocs", "mltMaxLabels", "mltSeedExpansion", "mltSeedExpansionDocs",
  "selectByCount", "mltLabelSelection", "labelExpansion", "labelExpansionLimit"
]);

const quiet = program.quiet;
const ids = program.args;

const handler = new SuggestHandler(program.api);

handler.init(quiet).then(function () {
  suggest(ids, true);

  function suggest(ids, outputHeader) {
    if (ids.length === 0) {
      return;
    }

    const id = ids.pop();
    handler
      .handle(_.extend({ id: id }, params), { type: "csv", header: outputHeader })
      .then(function (output) {
        console.log(output);
        suggest(ids, false);
      })
      .catch(function (error) {
        console.log("Processing failed:", error.toString(), error);
      });
  }
}).catch(function (error) {
  console.log("Processing failed:", error.toString(), error);
});
