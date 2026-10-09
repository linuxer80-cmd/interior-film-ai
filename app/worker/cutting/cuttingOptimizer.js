import {
  optimizeCutting as coreOptimizeCutting,
  validateCuttingInput as coreValidateCuttingInput,
} from "./cuttingOptimizerCore";

export * from "./cuttingOptimizerCore";

const EMPTY_LOCATION =
  "__CUTTING_EMPTY_LOCATION__";
const EMPTY_PART =
  "__CUTTING_EMPTY_PART__";

function normalizeInput(input = {}) {
  return {
    ...input,
    sections: (input.sections || []).map(
      section => ({
        ...section,
        location:
          String(
            section.location ?? ""
          ).trim() || EMPTY_LOCATION,
        part:
          String(
            section.part ?? ""
          ).trim() || EMPTY_PART,
      })
    ),
  };
}

function restoreEmptyFields(value) {
  if (typeof value === "string") {
    return value
      .replaceAll(EMPTY_LOCATION, "")
      .replaceAll(EMPTY_PART, "");
  }

  if (Array.isArray(value)) {
    return value.map(restoreEmptyFields);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          restoreEmptyFields(item),
        ]
      )
    );
  }

  return value;
}

export function validateCuttingInput(input) {
  return restoreEmptyFields(
    coreValidateCuttingInput(
      normalizeInput(input)
    )
  );
}

export function optimizeCutting(input) {
  return restoreEmptyFields(
    coreOptimizeCutting(
      normalizeInput(input)
    )
  );
}
