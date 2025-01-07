import { UriTemplate } from "./uriTemplate.js";

describe("UriTemplate", () => {
  describe("simple string expansion", () => {
    it("should expand simple string variables", () => {
      const template = new UriTemplate("http://example.com/users/{username}");
      expect(template.expand({ username: "fred" })).toBe(
        "http://example.com/users/fred",
      );
    });

    it("should handle multiple variables", () => {
      const template = new UriTemplate("{x,y}");
      expect(template.expand({ x: "1024", y: "768" })).toBe("1024,768");
    });

    it("should encode reserved characters", () => {
      const template = new UriTemplate("{var}");
      expect(template.expand({ var: "value with spaces" })).toBe(
        "value+with+spaces",
      );
    });
  });

  describe("reserved expansion", () => {
    it("should not encode reserved characters with + operator", () => {
      const template = new UriTemplate("{+path}/here");
      expect(template.expand({ path: "/foo/bar" })).toBe("/foo/bar/here");
    });
  });

  describe("fragment expansion", () => {
    it("should add # prefix and not encode reserved chars", () => {
      const template = new UriTemplate("X{#var}");
      expect(template.expand({ var: "/test" })).toBe("X#/test");
    });
  });

  describe("label expansion", () => {
    it("should add . prefix", () => {
      const template = new UriTemplate("X{.var}");
      expect(template.expand({ var: "test" })).toBe("X.test");
    });
  });

  describe("path expansion", () => {
    it("should add / prefix", () => {
      const template = new UriTemplate("X{/var}");
      expect(template.expand({ var: "test" })).toBe("X/test");
    });
  });

  describe("query expansion", () => {
    it("should add ? prefix and name=value format", () => {
      const template = new UriTemplate("X{?var}");
      expect(template.expand({ var: "test" })).toBe("X?var=test");
    });
  });

  describe("form continuation expansion", () => {
    it("should add & prefix and name=value format", () => {
      const template = new UriTemplate("X{&var}");
      expect(template.expand({ var: "test" })).toBe("X&var=test");
    });
  });

  describe("matching", () => {
    it("should match simple strings and extract variables", () => {
      const template = new UriTemplate("http://example.com/users/{username}");
      const match = template.match("http://example.com/users/fred");
      expect(match).toEqual({ username: "fred" });
    });

    it("should match multiple variables", () => {
      const template = new UriTemplate("/users/{username}/posts/{postId}");
      const match = template.match("/users/fred/posts/123");
      expect(match).toEqual({ username: "fred", postId: "123" });
    });

    it("should return null for non-matching URIs", () => {
      const template = new UriTemplate("/users/{username}");
      const match = template.match("/posts/123");
      expect(match).toBeNull();
    });

    it("should handle exploded arrays", () => {
      const template = new UriTemplate("{/list*}");
      const match = template.match("/red,green,blue");
      expect(match).toEqual({ list: ["red", "green", "blue"] });
    });
  });

  describe("edge cases", () => {
    it("should handle empty variables", () => {
      const template = new UriTemplate("{empty}");
      expect(template.expand({})).toBe("");
      expect(template.expand({ empty: "" })).toBe("");
    });

    it("should handle undefined variables", () => {
      const template = new UriTemplate("{a}{b}{c}");
      expect(template.expand({ b: "2" })).toBe("2");
    });

    it("should handle special characters in variable names", () => {
      const template = new UriTemplate("{$var_name}");
      expect(template.expand({ "$var_name": "value" })).toBe("value");
    });
  });

  describe("complex patterns", () => {
    it("should handle nested path segments", () => {
      const template = new UriTemplate("/api/{version}/{resource}/{id}");
      expect(template.expand({
        version: "v1",
        resource: "users",
        id: "123"
      })).toBe("/api/v1/users/123");
    });

    it("should handle query parameters with arrays", () => {
      const template = new UriTemplate("/search{?tags*}");
      expect(template.expand({
        tags: ["nodejs", "typescript", "testing"]
      })).toBe("/search?tags=nodejs,typescript,testing");
    });

    it("should handle multiple query parameters", () => {
      const template = new UriTemplate("/search{?q,page,limit}");
      expect(template.expand({
        q: "test",
        page: "1",
        limit: "10"
      })).toBe("/search?q=test&page=1&limit=10");
    });
  });

  describe("matching complex patterns", () => {
    it("should match nested path segments", () => {
      const template = new UriTemplate("/api/{version}/{resource}/{id}");
      const match = template.match("/api/v1/users/123");
      expect(match).toEqual({
        version: "v1",
        resource: "users",
        id: "123"
      });
    });

    it("should match query parameters", () => {
      const template = new UriTemplate("/search{?q}");
      const match = template.match("/search?q=test");
      expect(match).toEqual({ q: "test" });
    });

    it("should match multiple query parameters", () => {
      const template = new UriTemplate("/search{?q,page}");
      const match = template.match("/search?q=test&page=1");
      expect(match).toEqual({ q: "test", page: "1" });
    });

    it("should handle partial matches correctly", () => {
      const template = new UriTemplate("/users/{id}");
      expect(template.match("/users/123/extra")).toBeNull();
      expect(template.match("/users")).toBeNull();
    });
  });
});
