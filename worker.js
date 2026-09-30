const ALLOWED_ORIGINS = new Set([
  "https://michelrizk334-creator.github.io",
  "http://localhost:8000",
  "http://localhost:8080"
]);

const FOOD_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const LABEL_MODEL = "@cf/google/gemma-4-26b-a4b-it";

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
   STABLE GENERIC FOOD LOOKUP
   ========================================================= */

/*
 * One deliberately simple rule:
 *
 * - A plain food name with no quantity => exactly 100 g.
 * - Look it up in USDA FoodData Central.
 * - Prefer a clean SR Legacy/plain match.
 * - If USDA cannot provide a clean match, fall back to Workers AI,
 *   still hard-locked to exactly 100 g.
 *
 * Explicit portions and meals continue through the original AI lookup.
 */

function genericFoodWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (word === "yoghurt" || word === "yoghurts") return "yogurt";
      if (word.length > 4 && word.endsWith("s")) return word.slice(0, -1);
      return word;
    });
}

function isSimpleGenericFoodQuery(query) {
  const text = String(query || "").trim().toLowerCase();

  if (!text) return false;

  /*
   * Any number or portion/measure wording means this is NOT the simple
   * generic 100 g path.
   */
  if (
    /\d/.test(text) ||
    /\b(g|gram|grams|kg|ml|milliliter|milliliters|l|liter|liters|oz|ounce|ounces|lb|pound|pounds|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|piece|pieces|serving|servings|plate|bowl|spoon|spoons|large|big|small|medium)\b/i.test(text)
  ) {
    return false;
  }

  const conversational =
    /\b(how many|how much|calorie|calories|macro|macros|estimate|calculate|tell me)\b/i.test(text);

  if (conversational) return false;

  const words = genericFoodWords(text);

  /*
   * Covers inputs such as:
   * banana
   * goat yogurt
   * chicken breast
   * peanut butter
   * cooked rice
   */
  return words.length >= 1 && words.length <= 4;
}

function usdaDataTypePriority(value) {
  const type = String(value || "").toLowerCase();

  if (type.includes("sr legacy")) return 0;
  if (type.includes("foundation")) return 1;
  if (type.includes("survey") || type.includes("fndds")) return 2;

  return 3;
}

function usdaGetNutrient(food, ids, numbers, names) {
  const list = Array.isArray(food?.foodNutrients)
    ? food.foodNutrients
    : [];

  for (const nutrient of list) {
    const id = Number(
      nutrient?.nutrientId ??
      nutrient?.id
    );

    const number = String(
      nutrient?.nutrientNumber ??
      nutrient?.number ??
      ""
    ).trim();

    const name = String(
      nutrient?.nutrientName ??
      nutrient?.name ??
      ""
    ).trim().toLowerCase();

    const unit = String(
      nutrient?.unitName ??
      nutrient?.unit ??
      ""
    ).trim().toUpperCase();

    const value = numberOrNull(
      nutrient?.value ??
      nutrient?.amount
    );

    if (value === null) continue;

    const idMatch =
      Array.isArray(ids) &&
      ids.includes(id);

    const numberMatch =
      Array.isArray(numbers) &&
      numbers.includes(number);

    const nameMatch =
      Array.isArray(names) &&
      names.some(expected => name === expected);

    if (idMatch || numberMatch || nameMatch) {
      return { value, unit };
    }
  }

  return null;
}

function usdaEnergyKcal(food) {
  /*
   * USDA standard Energy:
   * nutrient ID 1008 / legacy nutrient number 208.
   */
  const standard = usdaGetNutrient(
    food,
    [1008],
    ["208"],
    ["energy"]
  );

  if (standard) {
    if (standard.unit === "KCAL") return standard.value;
    if (standard.unit === "KJ") return standard.value / 4.184;
  }

  /*
   * Foundation records can use Atwater energy fields instead.
   * Use them only if standard Energy is unavailable.
   */
  const atwaterSpecific = usdaGetNutrient(
    food,
    [2048],
    [],
    ["metabolizable energy (atwater specific factor)"]
  );

  if (atwaterSpecific) {
    return atwaterSpecific.unit === "KJ"
      ? atwaterSpecific.value / 4.184
      : atwaterSpecific.value;
  }

  const atwaterGeneral = usdaGetNutrient(
    food,
    [2047],
    [],
    ["metabolizable energy (atwater general factor)"]
  );

  if (atwaterGeneral) {
    return atwaterGeneral.unit === "KJ"
      ? atwaterGeneral.value / 4.184
      : atwaterGeneral.value;
  }

  return null;
}

function usdaMacro(food, id, number, exactNames) {
  const nutrient = usdaGetNutrient(
    food,
    [id],
    [number],
    exactNames
  );

  return nutrient
    ? nutrient.value
    : null;
}

const GENERIC_BLOCKED_VARIANTS = new Set([
  "dried",
  "dehydrated",
  "chip",
  "chips",
  "powder",
  "powdered",
  "flour",
  "sweetened",
  "candied",
  "fried",
  "dessert",
  "snack",
  "bar",
  "cereal",
  "syrup",
  "juice",
  "nectar",
  "babyfood",
  "baby"
]);

const GENERIC_NEUTRAL_WORDS = new Set([
  "raw",
  "plain",
  "fresh",
  "ripe",
  "whole",
  "uncooked",
  "cooked",
  "boiled"
]);

function genericCandidateScore(food, query) {
  const description =
    cleanText(food?.description || "", 180);

  if (!description) return null;

  const queryWords = genericFoodWords(query);
  const candidateWords = genericFoodWords(description);
  const candidateSet = new Set(candidateWords);

  /*
   * Every query word must appear in the candidate, with a small
   * singular/plural/prefix tolerance.
   */
  for (const q of queryWords) {
    const matched =
      candidateSet.has(q) ||
      candidateWords.some(
        word =>
          (
            word.startsWith(q) ||
            q.startsWith(word)
          ) &&
          Math.min(word.length, q.length) >= 4
      );

    if (!matched) return null;
  }

  let blockedPenalty = 0;
  let extraPenalty = 0;

  for (const word of candidateWords) {
    const isQueryWord =
      queryWords.includes(word) ||
      queryWords.some(
        q =>
          (
            word.startsWith(q) ||
            q.startsWith(word)
          ) &&
          Math.min(word.length, q.length) >= 4
      );

    if (isQueryWord) continue;

    if (GENERIC_BLOCKED_VARIANTS.has(word)) {
      blockedPenalty += 100;
      continue;
    }

    if (!GENERIC_NEUTRAL_WORDS.has(word)) {
      extraPenalty += 1;
    }
  }

  const kcal = usdaEnergyKcal(food);

  if (
    kcal === null ||
    !Number.isFinite(kcal) ||
    kcal <= 0 ||
    kcal > 950
  ) {
    return null;
  }

  return {
    food,
    description,
    kcal,
    blockedPenalty,
    extraPenalty,
    dataTypePriority:
      usdaDataTypePriority(food?.dataType)
  };
}

async function lookupGenericFoodInUsda(query, env) {
  const apiKey =
    cleanText(
      env?.USDA_API_KEY ||
      "DEMO_KEY",
      200
    );

  const response =
    await fetch(
      "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" +
      encodeURIComponent(apiKey),
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CalorieCount/1.0 stable generic food lookup"
        },

        body:
          JSON.stringify({
            query,
            pageSize: 30,
            dataType: [
              "SR Legacy",
              "Foundation",
              "Survey (FNDDS)"
            ]
          })
      }
    );

  if (!response.ok) {
    throw new Error(
      "USDA FoodData Central returned HTTP " +
      response.status
    );
  }

  const data =
    await response.json();

  const foods =
    Array.isArray(data?.foods)
      ? data.foods
      : [];

  const scored =
    foods
      .map((food, index) => {
        const score =
          genericCandidateScore(
            food,
            query
          );

        if (!score) return null;

        return {
          ...score,
          index
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.blockedPenalty -
            b.blockedPenalty ||
          a.dataTypePriority -
            b.dataTypePriority ||
          a.extraPenalty -
            b.extraPenalty ||
          a.index -
            b.index
      );

  if (!scored.length) {
    return null;
  }

  const best = scored[0];

  /*
   * If the best match is actually a processed variant, do not use it.
   * Fall back to AI instead.
   */
  if (best.blockedPenalty > 0) {
    return null;
  }

  const food = best.food;

  const carbs = usdaMacro(
    food,
    1005,
    "205",
    ["carbohydrate, by difference", "carbohydrate"]
  );

  const protein = usdaMacro(
    food,
    1003,
    "203",
    ["protein"]
  );

  const fat = usdaMacro(
    food,
    1004,
    "204",
    ["total lipid (fat)", "total fat"]
  );

  return {
    name:
      cleanText(query, 120),

    description:
      cleanText(query, 500),

    reference_amount:
      100,

    unit:
      "grams",

    calories_kcal:
      round2(best.kcal),

    carbs_g:
      carbs === null
        ? 0
        : round2(carbs),

    protein_g:
      protein === null
        ? 0
        : round2(protein),

    fat_g:
      fat === null
        ? 0
        : round2(fat),

    basis_label:
      "per 100 g",

    assumptions:
      cleanText(
        "USDA FoodData Central " +
        (food?.dataType || "") +
        " match: " +
        best.description +
        ".",
        700
      )
  };
}

async function aiFoodSearch(query, env, forceGeneric100g = false) {
  const userContent =
    forceGeneric100g
      ? (
          "Estimate EXACTLY 100 g of the plain/common food: " +
          cleanText(query, 120) +
          ". Do not convert it to a serving, piece, cup, or medium item."
        )
      : query;

  const aiResponse =
    await env.AI.run(
      FOOD_MODEL,
      {
        messages: [
          {
            role: "system",
            content: FOOD_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: userContent
          }
        ],

        response_format: {
          type: "json_schema",
          json_schema: FOOD_SCHEMA
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

  if (!payload) {
    return [];
  }

  return normalizeFoodResults(
    payload
  );
}


/* =========================================================
   NUTRITION LABEL PHOTO SCANNER
   ========================================================= */

const LABEL_TRANSCRIBE_PROMPT = `
You are an OCR/document-reading specialist.

Read the photographed nutrition label carefully and TRANSCRIBE what is actually visible.

Important:
- Do not estimate nutrition from food knowledge.
- Do not invent missing or blurry values.
- Preserve table structure and column headers.
- If the label contains both "per 100 g" and "per serving" columns, transcribe BOTH columns separately.
- Preserve serving-size wording exactly when readable, for example:
  "Serving size: 1 biscuit (28 g)"
- Transcribe calories/energy, carbohydrate, protein and fat.
- Also transcribe product name if it is visibly present.
- Preserve units exactly as printed.
- Ignore marketing text unless needed to identify the product.
- If text is unclear, write [unreadable] instead of guessing.

Return a plain-text transcription only.
`;

const LABEL_INTERPRET_PROMPT = `
You convert an OCR transcription of a nutrition label into structured nutrition data for a calorie-tracking app.

You MUST use only the transcription supplied by the previous vision pass.
Do not use general food knowledge and do not invent missing values.

Return JSON only with exactly these keys:
{
  "product_name": string or null,
  "serving_amount": number or null,
  "serving_unit": "grams" or "milliliters" or "units" or null,
  "portion_description": string,
  "basis_label": string,
  "calories_kcal": number or null,
  "carbs_g": number or null,
  "protein_g": number or null,
  "fat_g": number or null,
  "warnings": string
}

SERVING RULES:
1. Always identify the nutrition basis being used.
2. "per 100 g" -> serving_amount = 100, serving_unit = "grams".
3. "per 250 ml" -> serving_amount = 250, serving_unit = "milliliters".
4. "Serving size: 1 biscuit" with no gram/ml equivalent -> serving_amount = 1, serving_unit = "units".
5. "Serving size: 2 biscuits" -> serving_amount = 2, serving_unit = "units".
6. If both count and gram/ml equivalent are shown, prefer the measurable gram/ml value:
   "1 biscuit (28 g)" -> serving_amount = 28, serving_unit = "grams".
   Preserve "1 biscuit (28 g)" in portion_description.
7. If both "per 100 g" and "per serving" columns exist:
   - if a clear serving size is printed, prefer the per-serving column;
   - otherwise use the per-100-g / per-100-ml column.
8. Calories, carbs, protein and fat MUST ALL come from the SAME selected column.
9. Never mix a per-100-g value with a per-serving value.
10. If serving amount or unit cannot be read, return null rather than guessing.

NUTRITION RULES:
- Prefer kcal if both kJ and kcal are present.
- If only kJ is present and clearly readable, convert using kcal = kJ / 4.184 and mention that conversion in warnings.
- Use total carbohydrate, total protein and total fat, not sugars or saturated fat.
- Printed zero is valid.
- Missing or unreadable values must be null.
- Ignore % Daily Value when extracting gram amounts.

TEXT RULES:
- product_name: only if visible in the transcription.
- portion_description: preserve useful serving text.
- basis_label: concise, e.g. "per 100 g", "per 30 g serving", "per 1 unit".
- warnings: mention uncertainty, unreadable fields, conversions, or multiple columns. Empty string if none.

Return JSON only. No markdown.
`;

function extractAiText(aiResponse) {
  if (
    aiResponse === null ||
    aiResponse === undefined
  ) {
    return "";
  }

  if (
    typeof aiResponse === "string"
  ) {
    return aiResponse.trim();
  }

  if (
    typeof aiResponse?.response === "string"
  ) {
    return aiResponse.response.trim();
  }

  const choiceContent =
    aiResponse?.choices?.[0]?.message?.content;

  if (
    typeof choiceContent === "string"
  ) {
    return choiceContent.trim();
  }

  if (
    Array.isArray(choiceContent)
  ) {
    return choiceContent
      .map(part =>
        typeof part === "string"
          ? part
          : part?.text || ""
      )
      .join("\n")
      .trim();
  }

  if (
    typeof aiResponse?.result === "string"
  ) {
    return aiResponse.result.trim();
  }

  return "";
}

function labelNumberOrNull(value, min = 0, max = 100000) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    return boundedNumber(
      value,
      min,
      max
    );
  }

  const normalized =
    String(value)
      .replace(",", ".")
      .match(/-?\d+(?:\.\d+)?/);

  if (!normalized) {
    return null;
  }

  return boundedNumber(
    normalized[0],
    min,
    max
  );
}

function normalizeLabelUnit(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const unit =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "g",
      "gram",
      "grams"
    ].includes(unit)
  ) {
    return "grams";
  }

  if (
    [
      "ml",
      "milliliter",
      "milliliters",
      "millilitre",
      "millilitres"
    ].includes(unit)
  ) {
    return "milliliters";
  }

  if (
    [
      "unit",
      "units",
      "item",
      "items",
      "piece",
      "pieces",
      "biscuit",
      "biscuits",
      "cookie",
      "cookies",
      "bar",
      "bars",
      "serving",
      "servings"
    ].includes(unit)
  ) {
    return "units";
  }

  return null;
}

function normalizeLabelScanPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const label = {
    product_name:
      cleanText(
        payload.product_name,
        120
      ) || null,

    serving_amount:
      labelNumberOrNull(
        payload.serving_amount,
        0.01,
        100000
      ),

    serving_unit:
      normalizeLabelUnit(
        payload.serving_unit
      ),

    portion_description:
      cleanText(
        payload.portion_description,
        250
      ),

    basis_label:
      cleanText(
        payload.basis_label,
        180
      ),

    calories_kcal:
      labelNumberOrNull(
        payload.calories_kcal,
        0,
        50000
      ),

    carbs_g:
      labelNumberOrNull(
        payload.carbs_g,
        0,
        10000
      ),

    protein_g:
      labelNumberOrNull(
        payload.protein_g,
        0,
        10000
      ),

    fat_g:
      labelNumberOrNull(
        payload.fat_g,
        0,
        10000
      ),

    warnings:
      cleanText(
        payload.warnings,
        700
      )
  };

  if (
    !label.portion_description &&
    label.serving_amount !== null &&
    label.serving_unit
  ) {
    label.portion_description =
      `Per ${label.serving_amount} ${
        label.serving_unit === "milliliters"
          ? "ml"
          : label.serving_unit === "grams"
          ? "g"
          : "unit"
      }`;
  }

  if (
    !label.basis_label &&
    label.serving_amount !== null &&
    label.serving_unit
  ) {
    label.basis_label =
      `per ${label.serving_amount} ${
        label.serving_unit === "milliliters"
          ? "ml"
          : label.serving_unit === "grams"
          ? "g"
          : "unit"
      }`;
  }

  return label;
}

async function scanNutritionLabel(image, env) {
  /*
   * PASS 1 — strong vision/OCR model.
   * Gemma reads the image and produces a faithful table transcription.
   */
  const visionResponse =
    await env.AI.run(
      LABEL_MODEL,
      {
        messages: [
          {
            role:
              "system",

            content:
              LABEL_TRANSCRIBE_PROMPT
          },
          {
            role:
              "user",

            content: [
              {
                type:
                  "text",

                text:
                  "Transcribe the nutrition label in this image. Preserve serving text, table headers and the nutrition rows."
              },
              {
                type:
                  "image_url",

                image_url: {
                  url:
                    image
                }
              }
            ]
          }
        ],

        max_tokens:
          1400,

        temperature:
          0,

        top_p:
          0.9,

        chat_template_kwargs: {
          enable_thinking:
            false
        }
      }
    );

  const transcription =
    extractAiText(
      visionResponse
    );

  if (!transcription) {
    return null;
  }

  /*
   * PASS 2 — text reasoning/structuring model.
   * It receives NO image. It only interprets the transcription,
   * chooses one consistent nutrition basis, and returns app fields.
   */
  const structureResponse =
    await env.AI.run(
      FOOD_MODEL,
      {
        messages: [
          {
            role:
              "system",

            content:
              LABEL_INTERPRET_PROMPT
          },
          {
            role:
              "user",

            content:
              "Nutrition-label transcription:\n\n" +
              transcription
          }
        ],

        max_tokens:
          900,

        temperature:
          0,

        top_p:
          0.9,

        seed:
          42
      }
    );

  const payload =
    extractWorkersAiPayload(
      structureResponse
    );

  const label =
    normalizeLabelScanPayload(
      payload
    );

  if (!label) {
    return null;
  }

  /*
   * Validation / traceability:
   * keep a short warning when the OCR pass marked text unreadable.
   */
  if (
    /\[unreadable\]/i.test(
      transcription
    )
  ) {
    label.warnings =
      cleanText(
        [
          label.warnings,
          "Some label text was unreadable in the photo."
        ]
          .filter(Boolean)
          .join(" "),
        700
      );
  }

  return label;
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

          worker_version:
            "v30.4.3-two-pass-label-scanner",

          food_lookup_mode:
            "generic no-quantity -> USDA 100 g; explicit portions/meals -> original Workers AI",

          barcode:
            "Open Food Facts",

          food_search:
            "Cloudflare Workers AI",

          nutrition_label_scan:
            "Cloudflare Workers AI Vision",

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
       NUTRITION LABEL PHOTO SCANNER
       ----------------------------------------------------- */

    if (
      request.method === "POST" &&
      url.pathname === "/label-scan"
    ) {
      if (!env.AI) {
        return json(
          {
            error:
              "Workers AI is not configured."
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
              "Invalid image request."
          },
          400,
          origin
        );
      }

      const image =
        typeof body?.image === "string"
          ? body.image.trim()
          : "";

      if (
        !/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(
          image
        )
      ) {
        return json(
          {
            error:
              "Choose a JPEG, PNG or WebP nutrition-label photo."
          },
          400,
          origin
        );
      }

      if (
        image.length > 8_000_000
      ) {
        return json(
          {
            error:
              "This image is too large. Retake the photo closer to the nutrition label."
          },
          413,
          origin
        );
      }

      try {
        const label =
          await scanNutritionLabel(
            image,
            env
          );

        if (!label) {
          return json(
            {
              error:
                "The nutrition label could not be read. Try a clearer, closer photo."
            },
            422,
            origin
          );
        }

        return json(
          {
            label
          },
          200,
          origin
        );

      } catch (error) {
        console.error(
          "Nutrition label scan error:",
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

      /*
       * SIMPLE GENERIC FOOD ONLY:
       * A query like "Banana" or "Goat yogurt" with no quantity
       * first tries USDA and is returned per 100 g.
       *
       * If USDA fails, we simply continue into the exact original
       * Workers AI food-search code below.
       *
       * Explicit portions such as "2 tablespoons peanut butter"
       * do NOT enter this branch at all.
       */
      if (
        isSimpleGenericFoodQuery(
          query
        )
      ) {
        try {
          const usdaResult =
            await lookupGenericFoodInUsda(
              query,
              env
            );

          if (usdaResult) {
            return json(
              {
                results: [
                  usdaResult
                ]
              },
              200,
              origin
            );
          }
        } catch (usdaError) {
          console.error(
            "USDA generic lookup error; falling back to original AI:",
            usdaError
          );
        }
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
