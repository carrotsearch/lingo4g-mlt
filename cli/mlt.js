process.on('uncaughtException', function(err) {
  console.log(err);
});

// Dependencies
const _          = require("lodash");
const program    = require('commander');
const MLTHandler = require('./handlers/mlt');
const Lingo4G =    require("../lib/lingo4g/api");

// Parse parameters
program
  .version("0.0.1") // TODO: replace this during build
  .usage('[options] <query ...>')
  .option('--max-docs <n>', 'Maximum number of similar documents to fetch.', parseInt)
  .option('--max-labels <n>', 'Maximum number of labels to use to fetch similar documents.', parseInt)
  .option('--min-labels-matching <n>', 'Minimum number of MLT query labels each MLT document must contain.', parseInt)
  .option('--filter-query <s>', 'Additional filter query to apply to the result.')
  .option('--preserve-seed', 'Preserves seed documents in the result.')
  .option('--no-preserve-seed', 'Excludes seed documents from the result.')
  .option('--seed-expansion', 'Expand the seed documents by adding similar documents.')
  .option('--seed-expansion-docs', 'The number of similar expansion documents to add to seed.', parseInt)
  .option('--seed-expansion-filter-query <s>', 'Additional filter query to apply to the documents expanding the seed.')
  .option('--label-selection <s>', "Which labels to use to build MLT query. Allowed values: 'flat' (uses the complete label list), 'exemplars' (uses only labels selected as label cluster exemplars).")
  .option('--label-expansion', 'Expand MLT label set by adding similar labels.')
  .option('--label-expansion-limit', 'The number of similar labels to add.', parseInt)
  .option('--output-mlt-labels', "Output the labels used to generate the MLT query.")
  .option('--output-doc-labels', "Output top labels for each MLT document.")
  .option('--api [api-url-base]', 'The base URL of Lingo4G REST API.')
  .parse(process.argv);

const params = _.pick(program, [
  "maxDocs", "maxLabels", "minLabelsMatching", "seedExpansion", "seedExpansionDocs", "seedExpansionFilterQuery",
  "labelExpansion", "labelExpansionLimit",
  "filterQuery", "labelSelection", "preserveSeed", "outputMltLabels", "outputDocLabels"
]);
const queries = program.args;

const handler = new MLTHandler(program.api);
handler.init().then(function () {
  // Output MLT
  doMlt(queries, true);

  function doMlt(queries, outputHeader) {
    if (queries.length == 0) {
      return;
    }

    const query = queries.shift();
    handler
      .handle(_.extend({ seedQuery: query }, params), { type: "csv", header: outputHeader })
      .then(function (output) {
        console.log(output);
        doMlt(queries, false);
      })
      .catch(function (error) {
        console.log("Processing failed:", error.toString(), error);
      });
  }
}).catch(function (error) {
  console.log("Processing failed:", error.toString(), error);
});


