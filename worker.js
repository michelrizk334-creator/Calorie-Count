const ALLOWED_ORIGINS = new Set([
  "https://michelrizk334-creator.github.io",
  "http://localhost:8000",
  "http://localhost:8080"
]);

const FOOD_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function corsHeaders(origin = "") {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://michelrizk334-creator.github.io";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = "", extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function requestOriginAllowed(request) {
  const origin = request.headers.get("Origin") || "";
  return origin === "" || ALLOWED_ORIGINS.has(origin);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);

    if (n !== null) {
      return n;
    }
  }

  return null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function boundedNumber(value, min, max) {
  const n = Number(value);

  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max
  ) {
    return null;
  }

  return round2(n);
}

function normalizeUnit(value) {
  const unit =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    [
      "grams",
      "gram",
      "g"
    ].includes(unit)
  ) {
    return "grams";
  }

  if (
    [
      "milliliters",
      "milliliter",
      "ml",
      "millilitres",
      "millilitre"
    ].includes(unit)
  ) {
    return "milliliters";
  }

  if (
    [
      "units",
      "unit",
      "item",
      "items",
      "portion",
      "portions",
      "serving",
      "servings"
    ].includes(unit)
  ) {
    return "units";
  }

  return null;
}

function parseJsonLike(value) {
  if (
    value &&
    typeof value === "object"
  ) {
    return value;
  }

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  let text =
    value.trim();

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(text);
  } catch {
    const start =
      text.indexOf("{");

    const end =
      text.lastIndexOf("}");

    if (
      start === -1 ||
      end === -1 ||
      end <= start
    ) {
      return null;
    }

    try {
      return JSON.parse(
        text.slice(
          start,
          end + 1
        )
      );
    } catch {
      return null;
    }
  }
}

function extractWorkersAiPayload(aiResponse) {
  if (
    aiResponse === null ||
    aiResponse === undefined
  ) {
    return null;
  }

  /*
   * Workers AI JSON mode normally puts
   * the structured response in .response.
   */
  if (
    typeof aiResponse === "object" &&
    "response" in aiResponse
  ) {
    return parseJsonLike(
      aiResponse.response
    );
  }

  /*
   * Defensive fallback if a model/runtime
   * returns the payload directly.
   */
  return parseJsonLike(
    aiResponse
  );
}

function normalizeFoodResult(raw) {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const name =
    cleanText(
      raw.name,
      120
    );

  const description =
    cleanText(
      raw.description,
      500
    );

  const assumptions =
    cleanText(
      raw.assumptions,
      700
    );

  const unit =
    normalizeUnit(
      raw.unit
    );

  if (
    !name ||
    !unit
  ) {
    return null;
  }

  let referenceAmount =
    boundedNumber(
      raw.reference_amount,
      0.01,
      100000
    );

  const calories =
    boundedNumber(
      raw.calories_kcal,
      0,
      50000
    );

  const carbs =
    boundedNumber(
      raw.carbs_g,
      0,
      10000
    );

  const protein =
    boundedNumber(
      raw.protein_g,
      0,
      10000
    );

  const fat =
    boundedNumber(
      raw.fat_g,
      0,
      10000
    );

  if (
    referenceAmount === null ||
    calories === null ||
    carbs === null ||
    protein === null ||
    fat === null
  ) {
    return null;
  }

  /*
   * Complete described meals / portions
   * are always one Unit in v27.
   */
  if (
    unit === "units"
  ) {
    referenceAmount = 1;
  }

  let basisLabel =
    cleanText(
      raw.basis_label,
      180
    );

  if (!basisLabel) {
    basisLabel =
      unit === "units"
        ? "whole described portion"
        : `per ${referenceAmount} ${
            unit === "milliliters"
              ? "ml"
              : "g"
          }`;
  }

  return {
    name,
    description:
      description || name,

    reference_amount:
      referenceAmount,

    unit,

    calories_kcal:
      calories,

    carbs_g:
      carbs,

    protein_g:
      protein,

    fat_g:
      fat,

    basis_label:
      basisLabel,

    assumptions
  };
}

function normalizeFoodResults(payload) {
  const source =
    Array.isArray(
      payload?.results
    )
      ? payload.results
      : [];

  const out = [];

  const seen =
    new Set();

  for (
    const raw of source
  ) {
    const item =
      normalizeFoodResult(
        raw
      );

    if (!item) {
      continue;
    }

    const key =
      `${item.name.toLowerCase()}|` +
      `${item.description.toLowerCase()}|` +
      `${item.reference_amount}|` +
      `${item.unit}`;

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    out.push(item);

    if (
      out.length === 3
    ) {
      break;
    }
  }

  return out;
}

function classifyAiError(error) {
  const message =
    String(
      error?.message ||
      error ||
      ""
    );

  const lower =
    message.toLowerCase();

  if (
    lower.includes("3036") ||
    lower.includes(
      "daily free allocation"
    ) ||
    lower.includes(
      "10,000 neurons"
    ) ||
    lower.includes(
      "10000 neurons"
    )
  ) {
    return {
      status: 429,
      message:
        "Today's free AI allowance has been used. Try again after Cloudflare's daily reset at 00:00 UTC."
    };
  }

  if (
    lower.includes("3040") ||
    lower.includes(
      "out of capacity"
    ) ||
    lower.includes(
      "capacity temporarily exceeded"
    )
  ) {
    return {
      status: 503,
      message:
        "The AI service is temporarily busy. Please try again in a moment."
    };
  }

  if (
    lower.includes("5035") ||
    lower.includes(
      "requires workers paid"
    ) ||
    lower.includes(
      "requires a paid"
    )
  ) {
    return {
      status: 503,
      message:
        "This AI model is not available on the current Cloudflare plan."
    };
  }

  if (
    lower.includes(
      "json mode couldn't be met"
    ) ||
    lower.includes(
      "json mode could not be met"
    )
  ) {
    return {
      status: 502,
      message:
        "The AI could not structure this nutrition estimate. Please try rephrasing the food description."
    };
  }

  return {
    status: 500,
    message:
      "Could not look up this food right now. Please try again."
  };
}


/* =========================================================
   EXISTING BARCODE LOOKUP
   ========================================================= */

async function lookupBarcode(barcode) {
  if (
    !/^\d{8,14}$/.test(
      barcode
    )
  ) {
    const error =
      new Error(
        "Invalid barcode."
      );

    error.name = "INVALID_BARCODE";

    throw error;
  }

  const fields = [
    "code",
    "product_name",
    "brands",
    "nutriments",
    "nutrition_data_per",
    "serving_size",
    "serving_quantity",
    "serving_quantity_unit"
  ].join(",");

  const apiUrl =
    "https://world.openfoodfacts.org/api/v2/product/" +
    encodeURIComponent(
      barcode
    ) +
    ".json?fields=" +
    encodeURIComponent(
      fields
    );

  const response =
    await fetch(
      apiUrl,
      {
        headers: {
          "User-Agent":
            "CalorieCount/1.0 (nutrition lookup)"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      "Food database returned HTTP " +
      response.status +
      "."
    );
  }

  const data =
    await response.json();

  if (
    data.status !== 1 ||
    !data.product
  ) {
    const error =
      new Error(
        "Product not found in the food database."
      );

    error.name = "NOT_FOUND";

    throw error;
  }

  const product =
    data.product;

  const n =
    product.nutriments || {};

  let referenceAmount =
    100;

  let unit =
    "grams";

  let basisLabel =
    "per 100 g";

  let carbs =
    firstNumber(
      n.carbohydrates_100g,
      n.carbohydrates
    );

  let protein =
    firstNumber(
      n.proteins_100g,
      n.proteins
    );

  let fat =
    firstNumber(
      n.fat_100g,
      n.fat
    );

  let calories =
    firstNumber(
      n["energy-kcal_100g"],
      n["energy-kcal"]
    );

  let warning =
    "";

  if (
    calories === null
  ) {
    const kj =
      firstNumber(
        n["energy-kj_100g"],
        n["energy-kj"]
      );

    if (
      kj !== null
    ) {
      calories =
        kj / 4.184;

      warning =
        "Calories converted from kJ.";
    }
  }

  const missingPer100 =
    carbs === null &&
    protein === null &&
    fat === null &&
    calories === null;

  if (
    missingPer100
  ) {
    const servingQuantity =
      numberOrNull(
        product.serving_quantity
      );

    const servingUnit =
      String(
        product.serving_quantity_unit ||
        ""
      )
        .trim()
        .toLowerCase();

    const servingCarbs =
      numberOrNull(
        n.carbohydrates_serving
      );

    const servingProtein =
      numberOrNull(
        n.proteins_serving
      );

    const servingFat =
      numberOrNull(
        n.fat_serving
      );

    let servingCalories =
      numberOrNull(
        n["energy-kcal_serving"]
      );

    if (
      servingCalories === null
    ) {
      const servingKj =
        numberOrNull(
          n["energy-kj_serving"]
        );

      if (
        servingKj !== null
      ) {
        servingCalories =
          servingKj / 4.184;

        warning =
          "Calories converted from kJ.";
      }
    }

    if (
      servingQuantity !== null &&
      (
        servingCarbs !== null ||
        servingProtein !== null ||
        servingFat !== null ||
        servingCalories !== null
      )
    ) {
      referenceAmount =
        servingQuantity;

      if (
        [
          "ml",
          "milliliter",
          "milliliters",
          "millilitre",
          "millilitres"
        ].includes(
          servingUnit
        )
      ) {
        unit =
          "milliliters";

      } else if (
        [
          "unit",
          "units",
          "piece",
          "pieces",
          "item",
          "items"
        ].includes(
          servingUnit
        )
      ) {
        unit =
          "units";

      } else {
        unit =
          "grams";
      }

      carbs =
        servingCarbs;

      protein =
        servingProtein;

      fat =
        servingFat;

      calories =
        servingCalories;

      basisLabel =
        "per serving (" +
        referenceAmount +
        " " +
        (
          unit === "milliliters"
            ? "ml"
            : unit === "units"
            ? "unit"
            : "g"
        ) +
        ")";
    }
  }

  if (
    carbs === null &&
    protein === null &&
    fat === null &&
    calories === null
  ) {
    const error =
      new Error(
        "Product found, but nutrition information is unavailable."
      );

    error.name = "NO_NUTRITION";

    throw error;
  }

  const warningParts = [
    warning,
    "Open Food Facts is community-maintained. Review the package label before saving."
  ].filter(Boolean);

  return {
    product_name:
      product.product_name ||
      product.brands ||
      null,

    reference_amount:
      referenceAmount,

    unit,

    calories_kcal:
      calories !== null
        ? round2(calories)
        : 0,

    carbs_g:
      carbs !== null
        ? round2(carbs)
        : 0,

    protein_g:
      protein !== null
        ? round2(protein)
        : 0,

    fat_g:
      fat !== null
        ? round2(fat)
        : 0,

    basis_label:
      basisLabel,

    warning:
      warningParts.join(" ")
  };
}


/* =========================================================
   AI FOOD SEARCH JSON SCHEMA
   ========================================================= */

const FOOD_SCHEMA = {
  type: "object",

  properties: {
    results: {
      type: "array",
      minItems: 1,
      maxItems: 3,

      items: {
        type: "object",

        properties: {
          name: {
            type: "string"
          },

          description: {
            type: "string"
          },

          reference_amount: {
            type: "number"
          },

          unit: {
            type: "string",
            enum: [
              "grams",
              "milliliters",
              "units"
            ]
          },

          calories_kcal: {
            type: "number"
          },

          carbs_g: {
            type: "number"
          },

          protein_g: {
            type: "number"
          },

          fat_g: {
            type: "number"
          },

          basis_label: {
            type: "string"
          },

          assumptions: {
            type: "string"
          }
        },

        required: [
          "name",
          "description",
          "reference_amount",
          "unit",
          "calories_kcal",
          "carbs_g",
          "protein_g",
          "fat_g",
          "basis_label",
          "assumptions"
        ],

        additionalProperties:
          false
      }
    }
  },

  required: [
    "results"
  ],

  additionalProperties:
    false
};


/* =========================================================
   AI FOOD SEARCH INSTRUCTIONS
   ========================================================= */

const FOOD_SYSTEM_PROMPT = `
You are the nutrition estimation engine for Calorie Count.

The user may enter a food name, a branded/restaurant item, a quantity, a complete meal description, or a conversational nutrition question.

Examples:
- banana
- 300 g cooked chicken breast
- How many calories are there in 2 big tablespoons of peanut butter?
- 2 big cooked chicken breasts with 2 spoons of pesto sauce and 1 big cup of pasta

Rules:

1. Return nutrition estimates only. Do not answer conversationally.

2. DESCRIPTION CLEANING IS REQUIRED.

The description must contain only the actual food/portion being estimated.

Remove phrases such as:
"how many calories are there in",
"what are the macros of",
"can you tell me",
"tell me",
"calculate",
"estimate",
and similar conversational wording.

Example input:
"How many calories are there in 2 big tablespoons of peanut butter?"

Good description:
"2 big tablespoons of peanut butter"

Bad description:
"How many calories are there in 2 big tablespoons of peanut butter?"

3. If the user specifies a quantity, portion, serving, or complete meal, estimate the WHOLE described portion as ONE result.

For that result:
- reference_amount = 1
- unit = "units"
- calories and macros are totals for the entire described portion
- description preserves the meaningful foods and quantities
- basis_label = "whole described portion"

4. For a complete meal, combine all ingredients into one saved item.
Do not return each ingredient as a separate result.

5. If the user gives a generic single food with NO quantity, use a standard reference of 100 g, or 100 ml only when it is clearly a liquid.

You may return up to 3 useful interpretations only if the query is genuinely ambiguous.

6. name must be short and useful in a Support List.
description may be more detailed.

7. For ambiguous measures such as:
"big",
"large spoon",
"cup",
or
"big chicken breast",

make reasonable assumptions and clearly state the important assumed weights/volumes in assumptions.

8. For branded or restaurant foods, if exact nutrition is uncertain, say that in assumptions.

Never pretend to have exact package-label values you do not know.

9. calories_kcal, carbs_g, protein_g, and fat_g must all refer to the SAME reference portion and must be non-negative numbers.

10. These values are practical nutrition estimates, not laboratory measurements.

Keep assumptions concise and useful.

Return only the JSON required by the schema.
`;



/* =========================================================
   v28 RECIPE GENERATOR
   ========================================================= */

const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    assumptions: { type: "string" },
    instructions: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" }
    },
    ingredients: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          support_name: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          state: { type: "string", enum: ["Raw", "Cooked"] },
          reference_amount: { type: "number" },
          unit: { type: "string", enum: ["grams", "milliliters", "units"] },
          calories_kcal: { type: "number" },
          carbs_g: { type: "number" },
          protein_g: { type: "number" },
          fat_g: { type: "number" }
        },
        required: [
          "support_name", "name", "description", "quantity", "state",
          "reference_amount", "unit", "calories_kcal", "carbs_g", "protein_g", "fat_g"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["name", "assumptions", "instructions", "ingredients"],
  additionalProperties: false
};

function sanitizeRecipeTarget(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return round2(n);
}

function normalizeAppUnit(value) {
  const unit = normalizeUnit(value);
  if (unit === "milliliters") return "ml";
  if (unit === "units") return "Unit";
  return unit === "grams" ? "grams" : null;
}

function sanitizeSupportFood(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = cleanText(raw.name, 120);
  const unit = normalizeAppUnit(raw.unit);
  const serving = boundedNumber(raw.serving, 0.01, 100000);
  const carbs = boundedNumber(raw.carbs, 0, 10000);
  const protein = boundedNumber(raw.protein, 0, 10000);
  const fat = boundedNumber(raw.fat, 0, 10000);
  const kcal = boundedNumber(raw.kcal, 0, 50000);
  if (!name || !unit || serving === null || carbs === null || protein === null || fat === null || kcal === null) return null;
  const conversion = ["multiply", "divide"].includes(raw.conversion) ? raw.conversion : "none";
  const ratioRaw = numberOrNull(raw.ratio);
  const ratio = conversion === "none" || ratioRaw === null || ratioRaw < 1 ? null : round2(ratioRaw);
  return {
    name,
    description: cleanText(raw.description, 220),
    type: cleanText(raw.type, 80) || "Carbohydrates base",
    serving,
    unit,
    carbs,
    protein,
    fat,
    kcal,
    ratio,
    conversion: ratio ? conversion : "none"
  };
}

function recipeConversionMode(food) {
  if (food?.conversion) return food.conversion;
  if (!food?.ratio) return "none";
  return String(food.type || "").toLowerCase().includes("carbohydrate") ? "divide" : "multiply";
}

function recipeCalcItem(item) {
  const food = item.food;
  let factor = item.qty / food.serving;
  if (item.state === "Cooked" && food.ratio) {
    factor = recipeConversionMode(food) === "divide" ? factor / food.ratio : factor * food.ratio;
  }
  return {
    kcal: food.kcal * factor,
    c: food.carbs * factor,
    p: food.protein * factor,
    fat: food.fat * factor
  };
}

function recipeDominantBase(c, p, f) {
  if (p >= c && p >= f) return "Protein base";
  if (f >= c && f >= p) return "Fat base";
  return "Carbohydrates base";
}

function compactTargets(targets) {
  const parts = [];
  if (targets.protein_g !== null) parts.push(`protein ${targets.protein_g} g`);
  if (targets.carbs_g !== null) parts.push(`carbohydrates ${targets.carbs_g} g`);
  if (targets.fat_g !== null) parts.push(`fat ${targets.fat_g} g`);
  if (targets.calories_kcal !== null) parts.push(`calories ${targets.calories_kcal} kcal`);
  return parts.join(", ");
}

function normalizeRecipePayload(payload, mode, supportFoods, targets) {
  if (!payload || typeof payload !== "object") return null;
  const recipeName = cleanText(payload.name, 140) || "Generated meal";
  const assumptions = cleanText(payload.assumptions, 900);
  const instructions = Array.isArray(payload.instructions)
    ? payload.instructions.map(x => cleanText(x, 300)).filter(Boolean).slice(0, 8)
    : [];
  const rawIngredients = Array.isArray(payload.ingredients) ? payload.ingredients.slice(0, 8) : [];
  if (!rawIngredients.length) return null;

  const supportMap = new Map(supportFoods.map(f => [f.name.toLowerCase(), f]));
  const ingredients = [];

  for (const raw of rawIngredients) {
    const qty = boundedNumber(raw?.quantity, 0.01, 100000);
    const state = raw?.state === "Cooked" ? "Cooked" : "Raw";
    if (qty === null) continue;

    if (mode === "support") {
      const requested = cleanText(raw?.support_name || raw?.name, 120).toLowerCase();
      const food = supportMap.get(requested);
      if (!food) continue;
      ingredients.push({ food: structuredClone(food), qty, state });
      continue;
    }

    const name = cleanText(raw?.name, 120);
    const description = cleanText(raw?.description, 250);
    const unit = normalizeAppUnit(raw?.unit);
    const serving = boundedNumber(raw?.reference_amount, 0.01, 100000);
    const carbs = boundedNumber(raw?.carbs_g, 0, 10000);
    const protein = boundedNumber(raw?.protein_g, 0, 10000);
    const fat = boundedNumber(raw?.fat_g, 0, 10000);
    const kcal = boundedNumber(raw?.calories_kcal, 0, 50000);
    if (!name || !unit || serving === null || carbs === null || protein === null || fat === null || kcal === null) continue;
    ingredients.push({
      food: {
        name,
        description,
        type: recipeDominantBase(carbs, protein, fat),
        serving,
        unit,
        carbs,
        protein,
        fat,
        kcal,
        ratio: null,
        conversion: "none"
      },
      qty,
      state
    });
  }

  if (!ingredients.length) return null;
  if (mode === "support" && ingredients.length !== rawIngredients.length) return null;
  const totals = { kcal: 0, c: 0, p: 0, fat: 0 };
  for (const item of ingredients) {
    const q = recipeCalcItem(item);
    totals.kcal += q.kcal; totals.c += q.c; totals.p += q.p; totals.fat += q.fat;
  }

  return {
    name: recipeName,
    sourceMode: mode,
    targets,
    ingredients,
    instructions,
    assumptions,
    totals: {
      calories_kcal: round2(totals.kcal),
      carbs_g: round2(totals.c),
      protein_g: round2(totals.p),
      fat_g: round2(totals.fat)
    }
  };
}

const RECIPE_SYSTEM_PROMPT = `
You generate one practical meal idea for a calorie-tracking application.

The user provides one or more nutrition goals. Only the goals explicitly supplied are constraints. Missing goals are NOT zero and should not be optimized toward zero.

Your job is to create one coherent meal that gets as close as reasonably practical to the requested target(s). Exact equality is not required.

Two modes exist:

SUPPORT mode:
- You receive a catalog of foods from the user's Support List.
- You MUST use only foods from that catalog.
- For each ingredient, support_name MUST exactly match one catalog name character-for-character.
- Do not invent foods, sauces, oils, spices with calories, or ingredients that are not in the catalog.
- The app will calculate nutrition from the stored Support List values, so your nutrition numbers for these ingredients are only placeholders.
- Prefer practical ingredient quantities.

FREE mode:
- You may use normal foods not in the Support List.
- For each ingredient, provide nutrition for reference_amount of that ingredient, with unit grams, milliliters, or units.
- quantity is the actual quantity used in the recipe.
- Nutrition values must be internally consistent and refer to the same reference_amount.
- Use practical, recognizable foods and quantities.

General rules:
- Generate ONE meal, not multiple alternatives.
- Use roughly 2 to 7 ingredients when practical.
- Give concise preparation instructions.
- state must be Raw or Cooked and should describe the quantity being shown.
- If an ingredient is described as cooked in FREE mode, its nutrition values should correspond to the cooked/as-eaten ingredient and no raw/cooked conversion is needed by the app.
- Keep assumptions brief and disclose meaningful estimation assumptions.
- Return only JSON required by the schema.
`;

/* =========================================================
   WORKER
   ========================================================= */

export default {
  async fetch(request, env) {

    const origin =
      request.headers.get(
        "Origin"
      ) || "";

    const url =
      new URL(
        request.url
      );


    /* -----------------------------------------------------
       CORS PREFLIGHT
       ----------------------------------------------------- */

    if (
      request.method ===
      "OPTIONS"
    ) {
      if (
        origin &&
        !ALLOWED_ORIGINS.has(
          origin
        )
      ) {
        return new Response(
          null,
          {
            status: 403
          }
        );
      }

      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders(
              origin
            )
        }
      );
    }


    /*
     * Direct browser navigation has no Origin header.
     * Cross-site programmatic use is blocked.
     */

    if (
      !requestOriginAllowed(
        request
      )
    ) {
      return json(
        {
          error:
            "Origin not allowed."
        },
        403,
        origin
      );
    }


    /* -----------------------------------------------------
       HEALTH CHECK
       ----------------------------------------------------- */

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/"
    ) {
      return json(
        {
          ok: true,

          service:
            "Calorie Count",

          barcode:
            "Open Food Facts",

          food_search:
            "Cloudflare Workers AI",

          recipe_generator:
            "Cloudflare Workers AI",

          ai_binding_configured:
            Boolean(
              env.AI
            )
        },
        200,
        origin
      );
    }


    /* -----------------------------------------------------
       EXISTING BARCODE LOOKUP
       ----------------------------------------------------- */

    if (
      request.method === "GET" &&
      url.pathname.startsWith(
        "/barcode/"
      )
    ) {
      try {

        const barcode =
          decodeURIComponent(
            url.pathname.substring(
              "/barcode/".length
            )
          )
            .trim()
            .replace(
              /\s/g,
              ""
            );

        if (
          !barcode
        ) {
          return json(
            {
              error:
                "A barcode is required."
            },
            400,
            origin
          );
        }

        const nutrition =
          await lookupBarcode(
            barcode
          );

        return json(
          {
            nutrition
          },
          200,
          origin
        );

      } catch (error) {

        console.error(
          "Barcode lookup error:",
          error
        );

        if (
          error?.name === "INVALID_BARCODE"
        ) {
          return json(
            {
              error:
                "This does not look like a valid food barcode."
            },
            400,
            origin
          );
        }

        if (
          error?.name ===
          "NOT_FOUND"
        ) {
          return json(
            {
              error:
                "This barcode was not found. You can enter the food manually instead."
            },
            404,
            origin
          );
        }

        if (
          error?.name ===
          "NO_NUTRITION"
        ) {
          return json(
            {
              error:
                "The product was found, but nutrition information is missing. You can enter it manually instead."
            },
            422,
            origin
          );
        }

        return json(
          {
            error:
              "Could not look up this barcode.",

            details:
              cleanText(
                error?.message ||
                error,
                300
              )
          },
          500,
          origin
        );
      }
    }


    /* -----------------------------------------------------
       v27 FOOD / READY-MEAL LOOKUP
       FREE CLOUDFLARE WORKERS AI
       ----------------------------------------------------- */

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/food-search"
    ) {

      if (
        !env.AI
      ) {
        return json(
          {
            error:
              "Workers AI is not configured. Add a Workers AI binding named AI in Cloudflare."
          },
          500,
          origin
        );
      }

      let body;

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            error:
              "Invalid request body."
          },
          400,
          origin
        );
      }

      const query =
        cleanText(
          body?.query,
          600
        );

      if (
        !query
      ) {
        return json(
          {
            error:
              "Describe a food or meal first."
          },
          400,
          origin
        );
      }

      try {

        const aiResponse =
          await env.AI.run(
            FOOD_MODEL,
            {
              messages: [
                {
                  role:
                    "system",

                  content:
                    FOOD_SYSTEM_PROMPT
                },
                {
                  role:
                    "user",

                  content:
                    query
                }
              ],

              response_format: {
                type:
                  "json_schema",

                json_schema:
                  FOOD_SCHEMA
              },

              max_tokens:
                700,

              temperature:
                0.15,

              top_p:
                0.9,

              seed:
                42
            }
          );

        const payload =
          extractWorkersAiPayload(
            aiResponse
          );

        if (
          !payload
        ) {
          console.error(
            "Workers AI returned an unreadable payload:",
            aiResponse
          );

          return json(
            {
              error:
                "The AI returned an unreadable nutrition result. Please try again."
            },
            502,
            origin
          );
        }

        const results =
          normalizeFoodResults(
            payload
          );

        if (
          !results.length
        ) {
          console.error(
            "Workers AI returned no valid normalized results:",
            payload
          );

          return json(
            {
              error:
                "The AI did not return usable nutrition values. Try rephrasing the food or portion."
            },
            502,
            origin
          );
        }

        return json(
          {
            results
          },
          200,
          origin
        );

      } catch (error) {

        console.error(
          "Food search AI error:",
          error
        );

        const classified =
          classifyAiError(
            error
          );

        return json(
          {
            error:
              classified.message
          },
          classified.status,
          origin
        );
      }
    }



    /* -----------------------------------------------------
       v28 recipe generator using FREE Workers AI
       ----------------------------------------------------- */
    if (
      request.method === "POST" &&
      url.pathname === "/recipe-generate"
    ) {
      if (!env.AI) {
        return json({ error: "Workers AI is not configured. Add a Workers AI binding named AI in Cloudflare." }, 500, origin);
      }

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid request body." }, 400, origin); }

      const mode = body?.mode === "free" ? "free" : "support";
      const targets = {
        protein_g: sanitizeRecipeTarget(body?.targets?.protein_g, 1000),
        carbs_g: sanitizeRecipeTarget(body?.targets?.carbs_g, 2000),
        fat_g: sanitizeRecipeTarget(body?.targets?.fat_g, 1000),
        calories_kcal: sanitizeRecipeTarget(body?.targets?.calories_kcal, 10000)
      };

      if (!Object.values(targets).some(v => v !== null)) {
        return json({ error: "Enter at least one nutrition target." }, 400, origin);
      }

      const supportFoods = mode === "support"
        ? (Array.isArray(body?.supportFoods) ? body.supportFoods.slice(0, 250).map(sanitizeSupportFood).filter(Boolean) : [])
        : [];

      if (mode === "support" && !supportFoods.length) {
        return json({ error: "The Support List is empty or contains no usable foods." }, 400, origin);
      }

      const targetText = compactTargets(targets);
      const userContent = mode === "support"
        ? `Mode: SUPPORT\nRequested targets: ${targetText}\n\nSupport List catalog (use exact name in support_name):\n${JSON.stringify(supportFoods)}`
        : `Mode: FREE\nRequested targets: ${targetText}\n\nGenerate a practical meal using any normal foods.`;

      try {
        const aiResponse = await env.AI.run(FOOD_MODEL, {
          messages: [
            { role: "system", content: RECIPE_SYSTEM_PROMPT },
            { role: "user", content: userContent }
          ],
          response_format: { type: "json_schema", json_schema: RECIPE_SCHEMA },
          max_tokens: 1400,
          temperature: 0.35,
          top_p: 0.9
        });

        const payload = extractWorkersAiPayload(aiResponse);
        if (!payload) {
          console.error("Recipe AI returned unreadable payload:", aiResponse);
          return json({ error: "The AI returned an unreadable recipe. Please generate again." }, 502, origin);
        }

        const recipe = normalizeRecipePayload(payload, mode, supportFoods, targets);
        if (!recipe) {
          console.error("Recipe AI returned unusable recipe:", payload);
          return json({ error: mode === "support" ? "The AI could not build a valid recipe from your Support List. Try again or choose Use any foods." : "The AI did not return a usable recipe. Please generate again." }, 502, origin);
        }

        return json({ recipe }, 200, origin);
      } catch (error) {
        console.error("Recipe generation AI error:", error);
        const classified = classifyAiError(error);
        return json({ error: classified.message }, classified.status, origin);
      }
    }

    return json(
      {
        error:
          "Not found."
      },
      404,
      origin
    );
  }
};