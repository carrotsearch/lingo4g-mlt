# Lingo4G experimental text mining tools

This package is a set of Node.JS-based text mining experimental tools 
that use the [Lingo4G document clustering engine](https://carrotsearch.com/lingo4g). 

Currently, the package contains two tools:
 
* More Like This: fetches textually-similar documents given one or
  more seed documents,
   
* kNN classifier: suggest values of a document field,
 such as category or tag, based the values of that field in 
 textually-similar documents. 

> **Heads up, experimental code!** The code provided in this repository
> is highly-experimental and should be used for experimenting and
> and inspiration rather than production use.

## Prerequisites

All tools in this package require a running instance of the [Lingo4G document clustering engine](https://carrotsearch.com/lingo4g).

The default configuration of the tools and invocation examples
refer to the [arXiv paper abstracts Lingo4G data set](http://get.carrotsearch.com/lingo4g/latest/doc/#example-data-sets). 
Make sure your Lingo4G REST API instance serves that data set.

## Installation

1. Check out this repository.
1. In the main directory, run:

```npm install```

## Using the tools

### REST API

The easiest way to use the tools is to start up the built-in server
that will expose the REST API end point for each tools.

To run the server (assuming your Lingo4G REST API is at http://localhost:8080/api/v1):

```node cli\server.js```

Then, navigate to http://localhost:9090 for an overview page that lists
all the available endpoints and some example invocations.


### Command line

You can also access the tools from the command line.

#### More Like This

The basic invocation of the More Like This tool is the following:

```node cli\mlt.js id:1105.5789```

where the first argument is the query defining the seed document(s) to use
to find more textually-similar documents. Pass the --help option for 
a list of available parameters.

#### kNN classifier

The basic invocation of the kNN classifier is the following:

```node cli\suggest.js 1105.5789```

where the first argument is the identifier of the document for which
to suggest field values. The code is pre-configured to suggest the "category"
field for the provided paper abstract.

## Configuration

The tools in this package are preconfigured to match the arXiv Lingo4G
dataset. To use it with your own data, you may need to edit JSON
configuration files located in the `cli/handlers` folder.

### More Like This

Configuration of the More Like This tool is in `mlt.json`:

```json
{
  "mlt": {
    "expansion": {
      "type": "none"
    },
    "criteria": {
      "labels": {
        "overrides": {
          "labels": {
            "frequencies": {
              "maxLabelsPerDocument": 1000
            }
          }
        }
      }
    },
    "result": {
      "limit": 30,
      "fields": [
        { "name": "id" },
        { "name": "title" }
      ],
      "mltLabels": false,
      "docLabels": false
    }
  }
}
```

Most of the time, you will need to change the list of fields to include
in the output, which is defined by the `results.fiels` array. You may also 
want to tune the number of similar documents returned, which is defined
by the `result.limit` entry.

### kNN classifier

Configuration of the kNN classifier is in `suggest.json`:

```json
{
  "suggestions": {
    "limit": 30,
    "field": "category",
    "selectByCount": false
  },
  "mlt": {
    "expansion": {
      "type": "none"
    },
    "criteria": {
      "labels": {
        "selection": "flat",
        "weighting": "none",
        "overrides": {
          "labels": {
            "frequencies": {
              "maxLabelsPerDocument": 1000
            }
          }
        }
      }
    },
    "result": {
      "limit": 30
    }
  },
  "output": {
    "fields": []
  }
}
```

When switching to your custom data set, you'll need to provide the
name of the field to suggest. kNN classifier works best with fields 
containing tags or categories. You can provide the name of the field 
in the `suggestions.limit` entry. You can also customize the number
of similar documents to use when computing field suggestions in the
`mlt.result.limit` entry.