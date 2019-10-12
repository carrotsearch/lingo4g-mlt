const request = require("superagent");
const _       = require("lodash");

// TODO: return JSON object instead of raw response?
const Lingo4G = function(urlBase = "http://localhost:8080/api/v1", verbose = false) {
  this.startAnalysis = function (spec) {
    return request
      .post(urlBase + "/analysis")
      .send(spec)
      .then(logResponse)
      .catch(logError);
  };

  this.runAnalysisSync = function (spec) {
    return request
      .post(urlBase + "/analysis")
      .query("async", false)
      .send(spec)
      .then(logResponse)
      .catch(logError);
  };

  this.getAnalysisDocuments = function (analysisId, criteria) {
    return request
      .post(urlBase + "/analysis/" + analysisId + "/documents")
      .query("async", false)
      .send(criteria)
      .then(logResponse)
      .catch(logError);
  };

  this.about = function () {
    return request
      .get(urlBase + "/about")
      .send()
      .then(logResponse)
      .catch(logError)
  };

  this.getSimilarLabels = function (label, limit, slowBruteForce) {
    return request
      .get(urlBase + "/embedding/query")
      .query({ label: label, limit: limit, slowBruteForce: slowBruteForce })
      .send()
      .then(logResponse)
      .catch(logError)
  };

  this.urlBase = function () {
    return urlBase;
  };

  function logResponse(response) {
    if (verbose) {
      console.log("\n-------- Debug start -----");
      console.log("Status       :", response.status);
      console.log("URL          :", response.request.url);
      console.log("Request body :", JSON.stringify(response.request._data, null, 2));
      console.log("Response body:", response.text);
      console.log("-------- Debug end   ----\n");
    }
    return response;
  }

  function logError(error) {
    const response = error.response;
    if (verbose) {
      console.log("-------- Debug start -----");
      console.log("Status        :", response.status);
      console.log("URL           :", response.request.url);
      console.log("Response body :", response.text);
      console.log("Response error:", response.error);
      console.log("-------- Debug end   ----");
    }
    return response;
  }

};

Lingo4G.documentField = function (doc, fieldName) {
  return doc.content && _.get(doc.content.find(v => v.name === fieldName), "values");
};

module.exports = Lingo4G;
