import { describe, expect, it } from "vitest";
import {
  buildSearchText,
  extractHouseNumber,
  formatAddressLabel,
  normalizeAddress,
  parseStreet,
  wordsToNumbers,
} from "./address-normalize";

describe("wordsToNumbers", () => {
  const cases: [string, string][] = [
    ["thirty two eighty four", "3284"],
    ["thirty-two eighty-four", "3284"], // hyphens are stripped by normalizeAddress; here raw
    ["ten two five four", "10254"],
    ["one oh two five four", "10254"],
    ["one zero two five four", "10254"],
    ["three thousand two hundred eighty four", "3284"],
    ["twelve hundred thirty four", "1234"],
    ["one hundred and four", "104"],
    ["eighty nine", "89"],
    ["four", "4"],
    ["nineteen", "19"],
    ["twenty", "20"],
    ["two thousand forty six", "2046"],
    ["forty two hundred", "4200"],
    ["five oh five", "505"],
    ["one oh oh two", "1002"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" -> ${expected}`, () => {
      // wordsToNumbers works on already-lowercased, punctuation-free text.
      expect(wordsToNumbers(input.replace(/-/g, " "))).toBe(expected);
    });
  }

  it("leaves non-number words and lone 'o' alone", () => {
    expect(wordsToNumbers("unit o")).toBe("unit o");
    expect(wordsToNumbers("hundred acre wood")).toBe("hundred acre wood");
    expect(wordsToNumbers("old mangrove road")).toBe("old mangrove road");
  });

  it("splits groups the way house numbers are spoken", () => {
    expect(wordsToNumbers("thirty two eighty four harborlight")).toBe("3284 harborlight");
    expect(wordsToNumbers("unit two oh one")).toBe("unit 201");
  });
});

describe("normalizeAddress", () => {
  it("contracts suffixes and directionals and lowercases", () => {
    expect(normalizeAddress("10254 East Old Mangrove Road")).toBe("10254 e old mangrove rd");
    expect(normalizeAddress("4 Harborlight Shores Boulevard South")).toBe("4 harborlight shores blvd s");
    expect(normalizeAddress("3284 Harborlight Hollow Lane")).toBe("3284 harborlight hollow ln");
    expect(normalizeAddress("104 N Grouper Hollow Square")).toBe("104 n grouper hollow sq");
    expect(normalizeAddress("55 Pelican Court / Trail / Cove / Drive")).toBe("55 pelican ct trl cv dr");
  });

  it("is idempotent", () => {
    const once = normalizeAddress("10254 East Old Mangrove Road, Unit #36W, Pinecrest FL 33155");
    expect(normalizeAddress(once)).toBe(once);
  });

  it("strips punctuation and ordinals, keeps digits", () => {
    expect(normalizeAddress("1231 Harborlight Cay Rd., #283")).toBe("1231 harborlight cay rd unit 283");
    expect(normalizeAddress("42nd Street North")).toBe("42 st n");
    expect(normalizeAddress("Unit #8B")).toBe("unit 8b");
  });

  it("unifies unit designators including the data's 'Unti' typo", () => {
    expect(normalizeAddress("3880 E Old Mangrove Rd Unti 505")).toBe("3880 e old mangrove rd unit 505");
    expect(normalizeAddress("Apt 4B")).toBe("unit 4b");
    expect(normalizeAddress("Suite 210")).toBe("unit 210");
  });

  it("converts spoken numbers inside an address", () => {
    expect(normalizeAddress("thirty-two eighty-four harborlight hollow lane coral gables")).toBe(
      "3284 harborlight hollow ln coral gables",
    );
    expect(normalizeAddress("ten two five four old mangrove road high pointe 422")).toBe(
      "10254 old mangrove rd high pointe 422",
    );
  });

  it("handles empty input", () => {
    expect(normalizeAddress("")).toBe("");
    expect(normalizeAddress(null)).toBe("");
    expect(normalizeAddress(undefined)).toBe("");
  });
});

describe("parseStreet / extractHouseNumber", () => {
  it("splits the leading house number", () => {
    expect(parseStreet("10254 East Old Mangrove Rd")).toEqual({ houseNumber: 10254, streetName: "e old mangrove rd" });
    expect(parseStreet("3284 Harborlight Hollow Ln")).toEqual({ houseNumber: 3284, streetName: "harborlight hollow ln" });
  });
  it("keeps number-less streets whole", () => {
    expect(parseStreet("Lighthouse Bluff Building 11")).toEqual({ houseNumber: null, streetName: "lighthouse bluff bldg 11" });
    expect(parseStreet("")).toEqual({ houseNumber: null, streetName: "" });
  });
  it("reads a spoken house number", () => {
    expect(extractHouseNumber("thirty two eighty four harborlight hollow")).toBe(3284);
    expect(extractHouseNumber("old mangrove road")).toBeNull();
  });
});

describe("buildSearchText / formatAddressLabel", () => {
  it("builds 'street unit city zip' normalized", () => {
    expect(
      buildSearchText({ street: "10254 E Old Mangrove Rd", unit: "High Pointe Unit 36W", city: "Pinecrest", zip: "33155" }),
    ).toBe("10254 e old mangrove rd high pointe unit 36w pinecrest 33155");
    expect(buildSearchText({ street: "89 Harborlight Shores Blvd W", city: "Coral Gables", zip: "33162" })).toBe(
      "89 harborlight shores blvd w coral gables 33162",
    );
  });
  it("labels for speech", () => {
    expect(formatAddressLabel({ street: "1231 Harborlight Cay Rd", unit: "283", city: "Coral Gables" })).toBe(
      "1231 Harborlight Cay Rd, Unit 283, Coral Gables",
    );
    expect(formatAddressLabel({ street: "10343 E Old Mangrove Rd", unit: "Building G unit 375", city: "Pinecrest" })).toBe(
      "10343 E Old Mangrove Rd, Building G unit 375, Pinecrest",
    );
    expect(formatAddressLabel({ street: "5 Sea Oats Dr", unit: null, city: null })).toBe("5 Sea Oats Dr");
  });
});
