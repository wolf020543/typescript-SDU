# Prompt API
The Prompt API provides a set of prompts with optional
arguments and [autocompletion](completion.md) support.

## Listing Prompts
The client can request a set of prompts
from the server using the `prompts/list` call

A client request:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "prompts/list",
  "params": {}
}
```

And an appropriate server response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "prompts": [
      {
        "name": "my-prompt",
        "arguments": [
          {
            "name": "input",
            "description": "The input string",
            "required": false
          }
        ]
      }
    ]
  }
}
```

## Running a prompt
In order to run a prompt, the client issues
a `prompts/get` command:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "prompts/get",
  "params": {
    "name": "my-prompt",
    "arguments": {
      "input": "hello world"
    }
  }
}
```

and it's respective response:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "description": "An optional description of the prompt.",
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "This is a templated prompt. You passed the argument 'hello world'"
        }
      }
    ]
  }
}
```
