# Completion API
The completion API provides ability for clients to request a
set of completion options for a prompt argument or a resource template
argument.

## Basic Completion: completion/complete
The RPC method `completion/complete` is used for basic completion
tasks. They reference either a prompt or a uri template.

### Client Requests
#### Reference Example 1

The following example references a prompt with the name "weather-forecast".

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "completion/complete",
  "params": {
    "ref": {
      "type": "ref/prompt",
      "name": "weather-forecast"
    },
    "argument": {
      "name": "location",
      "value": "New"
    }
  }
}
```

#### Reference Example 2

The alternative is to reference a URI template of a resource:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "completion/complete",
  "params": {
    "ref": {
      "type": "ref/resource",
      "uri": "file://64e56d89-ba43-4664-87fc-ff6703527e3b/?as={mimeType}"
    },
    "argument": {
      "name": "mimeType",
      "value": ""
    }
  }
}
```

### Server Responses

Responses can only contain up to 100 elements.  The server should
notify the client how many elements are there in total. If the
server knows the *exact* amount, it should specifiy the amount in
`total` as an `integer`.  If the server does not know how many left,
but knows there are more completions than returned, `total` should
be set to `hasMore`.  This can be useful when the server wants to
make efficient database queries and limit the resultset. In cases
where the server does not know if there are any left, for example
when reading from a service that does not provide such information,
it can set `total` to `unknown`. This should be avoided if possible.

#### Example Response with known total

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "completion": {
      "values": [
        "New York",
        "New Orleans",
        "New Delhi",
        "New Haven",
        "New Jersey"
      ],
      "total": 5
    }
  }
}
```

#### Example Response with unknown total
The following case illustrates the case where the total
is unknown, but the server knows there are more elements
than returned:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "completion": {
      "values": [
        "New York",
        "New Orleans",
        "New Delhi",
        "New Haven",
        "New Jersey"
      ],
      "hasMore": true
    }
  }
}
```
