// Claude-authored implementation of RFC 6570 URI Templates

type Variables = Record<string, string | string[]>;

export class UriTemplate {
  private readonly parts: Array<
    | string
    | { name: string; operator: string; names: string[]; exploded: boolean }
  >;

  constructor(template: string) {
    this.parts = this.parse(template);
  }

  private parse(
    template: string,
  ): Array<
    | string
    | { name: string; operator: string; names: string[]; exploded: boolean }
  > {
    const parts: Array<
      | string
      | { name: string; operator: string; names: string[]; exploded: boolean }
    > = [];
    let currentText = "";
    let i = 0;

    while (i < template.length) {
      if (template[i] === "{") {
        if (currentText) {
          parts.push(currentText);
          currentText = "";
        }
        const end = template.indexOf("}", i);
        if (end === -1) throw new Error("Unclosed template expression");

        const expr = template.slice(i + 1, end);
        const operator = this.getOperator(expr);
        const exploded = expr.includes("*");
        const names = this.getNames(expr);
        const name = names[0];
        parts.push({ name, operator, names, exploded });
        i = end + 1;
      } else {
        currentText += template[i];
        i++;
      }
    }

    if (currentText) {
      parts.push(currentText);
    }

    return parts;
  }

  private getOperator(expr: string): string {
    const operators = ["+", "#", ".", "/", "?", "&"];
    return operators.find((op) => expr.startsWith(op)) || "";
  }

  private getNames(expr: string): string[] {
    const operator = this.getOperator(expr);
    return expr
      .slice(operator.length)
      .split(",")
      .map((name) => name.replace("*", "").trim())
      .filter((name) => name.length > 0);
  }

  private encodeValue(value: string, operator: string): string {
    if (operator === "+" || operator === "#") {
      return encodeURI(value);
    }
    return encodeURIComponent(value).replace(/%20/g, "+");
  }

  private expandPart(
    part: {
      name: string;
      operator: string;
      names: string[];
      exploded: boolean;
    },
    variables: Variables,
  ): string {
    if (part.operator === "?" || part.operator === "&") {
      const pairs = part.names
        .map((name) => {
          const value = variables[name];
          if (value === undefined) return "";
          const encoded = Array.isArray(value)
            ? value.map((v) => this.encodeValue(v, part.operator)).join(",")
            : this.encodeValue(value.toString(), part.operator);
          return `${name}=${encoded}`;
        })
        .filter((pair) => pair.length > 0);

      if (pairs.length === 0) return "";
      const separator = part.operator === "?" ? "?" : "&";
      return separator + pairs.join("&");
    }

    if (part.names.length > 1) {
      const values = part.names
        .map((name) => variables[name])
        .filter((v) => v !== undefined);
      if (values.length === 0) return "";
      return values.map((v) => (Array.isArray(v) ? v[0] : v)).join(",");
    }

    const value = variables[part.name];
    if (value === undefined) return "";

    const values = Array.isArray(value) ? value : [value];
    const encoded = values.map((v) => this.encodeValue(v, part.operator));

    switch (part.operator) {
      case "":
        return encoded.join(",");
      case "+":
        return encoded.join(",");
      case "#":
        return "#" + encoded.join(",");
      case ".":
        return "." + encoded.join(".");
      case "/":
        return "/" + encoded.join("/");
      default:
        return encoded.join(",");
    }
  }

  expand(variables: Variables): string {
    return this.parts
      .map((part) => {
        if (typeof part === "string") return part;
        return this.expandPart(part, variables);
      })
      .join("");
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private partToRegExp(part: {
    name: string;
    operator: string;
    names: string[];
    exploded: boolean;
  }): Array<{ pattern: string; name: string }> {
    const patterns: Array<{ pattern: string; name: string }> = [];

    if (part.operator === "?" || part.operator === "&") {
      for (let i = 0; i < part.names.length; i++) {
        const name = part.names[i];
        const prefix = i === 0 ? "\\" + part.operator : "&";
        patterns.push({
          pattern: prefix + this.escapeRegExp(name) + "=([^&]+)",
          name,
        });
      }
      return patterns;
    }

    let pattern: string;
    const name = part.name;

    switch (part.operator) {
      case "":
        pattern = part.exploded ? "([^/]+(?:,[^/]+)*)" : "([^/,]+)";
        break;
      case "+":
      case "#":
        pattern = "(.+)";
        break;
      case ".":
        pattern = "\\.([^/,]+)";
        break;
      case "/":
        pattern = "/" + (part.exploded ? "([^/]+(?:,[^/]+)*)" : "([^/,]+)");
        break;
      default:
        pattern = "([^/]+)";
    }

    patterns.push({ pattern, name });
    return patterns;
  }

  match(uri: string): Variables | null {
    let pattern = "^";
    const names: Array<{ name: string; exploded: boolean }> = [];

    for (const part of this.parts) {
      if (typeof part === "string") {
        pattern += this.escapeRegExp(part);
      } else {
        const patterns = this.partToRegExp(part);
        for (const { pattern: partPattern, name } of patterns) {
          pattern += partPattern;
          names.push({ name, exploded: part.exploded });
        }
      }
    }

    pattern += "$";
    const regex = new RegExp(pattern);
    const match = uri.match(regex);

    if (!match) return null;

    const result: Variables = {};
    for (let i = 0; i < names.length; i++) {
      const { name, exploded } = names[i];
      const value = match[i + 1];
      const cleanName = name.replace("*", "");

      if (exploded && value.includes(",")) {
        result[cleanName] = value.split(",");
      } else {
        result[cleanName] = value;
      }
    }

    return result;
  }
}