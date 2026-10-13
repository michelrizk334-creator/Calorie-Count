// =========================================================
// BARCODE SCANNER
// v30.5.5 — REFERENCE CALORIES + RELIABLE SAVE
// =========================================================

let barcodeStream = null;
let barcodeDetector = null;
let barcodeFrame = null;
let barcodeBusy = false;


/* ---------------------------------------------------------
   STATUS MESSAGE
--------------------------------------------------------- */

function setBarcodeStatus(message, type = "") {

  const status = $("#barcodeScanStatus");

  if (!status) return;

  status.textContent = message;

  status.className =
    "scan-status" +
    (type ? " " + type : "");
}


/* ---------------------------------------------------------
   NORMALIZE VALUES BEFORE PUTTING THEM IN NUMBER INPUTS
--------------------------------------------------------- */

function barcodeFormNumber(value, fallback = 0) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.round(
    n * 100
  ) / 100;
}


/* ---------------------------------------------------------
   STOP CAMERA
--------------------------------------------------------- */

function stopBarcodeCamera() {

  if (barcodeFrame) {
    cancelAnimationFrame(barcodeFrame);
    barcodeFrame = null;
  }

  if (barcodeStream) {

    barcodeStream
      .getTracks()
      .forEach(track => track.stop());

    barcodeStream = null;
  }

  const video =
    $("#barcodeVideo");

  if (video) {

    video.pause();

    video.srcObject = null;
  }

  barcodeBusy = false;
}


/* ---------------------------------------------------------
   SEND BARCODE TO CLOUDFLARE
--------------------------------------------------------- */

async function lookupBarcode(barcode) {

  barcode =
    String(barcode || "")
      .replace(/\D/g, "");

  if (!barcode) {

    setBarcodeStatus(
      "No barcode detected.",
      "error"
    );

    return;
  }


  $("#barcodeManual").value =
    barcode;


  setBarcodeStatus(
    "Looking up barcode " +
    barcode +
    "…"
  );


  try {

    const endpoint =
      aiEndpoint();


    const response =
      await fetch(
        endpoint +
        "/barcode/" +
        encodeURIComponent(barcode)
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Barcode lookup failed."
      );
    }


    const nutrition =
      data.nutrition;


    if (!nutrition) {

      throw new Error(
        "No nutrition information received."
      );
    }


    /*
     * Fill the EXISTING Add Food form.
     * Values are rounded to the form's 0.01 step so browser
     * validation cannot silently block the Save Food button.
     */


    if (nutrition.product_name) {

      $("#customName").value =
        nutrition.product_name;
    }


    $("#customServing").value =
      barcodeFormNumber(
        nutrition.reference_amount,
        100
      );


    if (
      nutrition.unit ===
      "milliliters"
    ) {

      $("#customUnit").value =
        "ml";

    } else if (
      nutrition.unit ===
      "units"
    ) {

      $("#customUnit").value =
        "Unit";

    } else {

      $("#customUnit").value =
        "grams";
    }


    const carbs =
      barcodeFormNumber(
        nutrition.carbs_g,
        0
      );

    const protein =
      barcodeFormNumber(
        nutrition.protein_g,
        0
      );

    const fat =
      barcodeFormNumber(
        nutrition.fat_g,
        0
      );

    const calories =
      barcodeFormNumber(
        nutrition.calories_kcal,
        0
      );


    $("#customCarbs").value =
      carbs;


    $("#customProtein").value =
      protein;


    $("#customFat").value =
      fat;


    $("#customKcal").value =
      calories;


    if (
      nutrition.basis_label
    ) {

      $("#customDescription").value =
        nutrition.basis_label;
    }


    $("#customType").value =
      dominantBase(
        carbs,
        protein,
        fat
      );


    $("#customRatio").value =
      "";

    $("#customConversion").value =
      "none";


    stopBarcodeCamera();


    let message =
      "Product found";


    if (
      nutrition.basis_label
    ) {

      message +=
        " — " +
        nutrition.basis_label;
    }


    message +=
      ". Calories and macros shown below are for that same reference amount. Review the values, then press Save Food.";


    if (
      nutrition.warning
    ) {

      message +=
        " " +
        nutrition.warning;
    }


    setBarcodeStatus(
      message,
      "ok"
    );


  } catch (error) {

    console.error(
      "Barcode lookup error:",
      error
    );


    setBarcodeStatus(

      error.message ||
      "Could not look up this barcode.",

      "error"

    );
  }
}


/* ---------------------------------------------------------
   CONTINUOUS CAMERA SCANNING
--------------------------------------------------------- */

async function barcodeScanLoop() {

  if (
    !barcodeStream ||
    !barcodeDetector
  ) {

    return;
  }


  try {

    const codes =
      await barcodeDetector.detect(
        $("#barcodeVideo")
      );


    if (
      codes.length > 0 &&
      !barcodeBusy
    ) {

      barcodeBusy = true;


      const barcode =
        codes[0].rawValue;


      await lookupBarcode(
        barcode
      );


      return;
    }

  } catch (error) {

    /*
     * Individual detection failures are
     * ignored because another camera
     * frame will immediately be checked.
     */

  }


  if (barcodeStream) {

    barcodeFrame =
      requestAnimationFrame(
        barcodeScanLoop
      );
  }
}


/* ---------------------------------------------------------
   OPEN / CLOSE BARCODE AREA
--------------------------------------------------------- */

$("#scanBarcodeBtn").onclick =
  () => {

    const box =
      $("#barcodeScanBox");


    box.hidden =
      !box.hidden;


    if (box.hidden) {

      stopBarcodeCamera();
    }
  };


/* ---------------------------------------------------------
   START CAMERA
--------------------------------------------------------- */

$("#startBarcodeCamera").onclick =
  async () => {

    stopBarcodeCamera();


    if (
      !("BarcodeDetector" in window)
    ) {

      setBarcodeStatus(
        "This browser does not support live barcode detection. You can enter the barcode number below.",
        "error"
      );

      return;
    }


    try {

      const supportedFormats =
        await BarcodeDetector
          .getSupportedFormats();


      const wantedFormats = [

        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "code_128"

      ].filter(
        format =>
          supportedFormats.includes(
            format
          )
      );


      if (
        wantedFormats.length
      ) {

        barcodeDetector =
          new BarcodeDetector({

            formats:
              wantedFormats

          });

      } else {

        barcodeDetector =
          new BarcodeDetector();
      }


      barcodeStream =
        await navigator
          .mediaDevices
          .getUserMedia({

            video: {

              facingMode: {
                ideal:
                  "environment"
              }

            },

            audio: false

          });


      const video =
        $("#barcodeVideo");


      video.srcObject =
        barcodeStream;


      await video.play();


      setBarcodeStatus(
        "Point the camera at the barcode…"
      );


      barcodeFrame =
        requestAnimationFrame(
          barcodeScanLoop
        );


    } catch (error) {

      console.error(
        "Barcode camera error:",
        error
      );


      stopBarcodeCamera();


      setBarcodeStatus(
        "Could not open the camera. Check camera permission or enter the barcode manually.",
        "error"
      );
    }
  };


/* ---------------------------------------------------------
   STOP BUTTON
--------------------------------------------------------- */

$("#stopBarcodeCamera").onclick =
  () => {

    stopBarcodeCamera();

    setBarcodeStatus(
      "Scanner stopped."
    );
  };


/* ---------------------------------------------------------
   MANUAL BARCODE LOOKUP
--------------------------------------------------------- */

$("#lookupBarcodeBtn").onclick =
  () => {

    lookupBarcode(
      $("#barcodeManual").value
    );
  };


$("#barcodeManual")
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        lookupBarcode(
          event.target.value
        );
      }
    }
  );


/* ---------------------------------------------------------
   RELIABLE FOOD SAVE
   barcode.js loads AFTER support.js, so this replaces the older
   submit handler with explicit validation instead of relying on
   browser step validation that could silently reject scanned values.
--------------------------------------------------------- */

const barcodeFoodEditorForm =
  $("#foodEditorForm");

if (barcodeFoodEditorForm) {

  barcodeFoodEditorForm.noValidate =
    true;

  barcodeFoodEditorForm.onsubmit =
    event => {

      event.preventDefault();


      const name =
        $("#customName")
          .value
          .trim();


      const serving =
        Number(
          $("#customServing").value
        );


      const carbs =
        Number(
          $("#customCarbs").value
        );


      const protein =
        Number(
          $("#customProtein").value
        );


      const fat =
        Number(
          $("#customFat").value
        );


      const kcal =
        Number(
          $("#customKcal").value
        );


      const mode =
        $("#customConversion").value;


      const ratioRaw =
        Number(
          $("#customRatio").value
        );


      if (!name) {

        alert(
          "Enter a food name before saving."
        );

        $("#customName").focus();

        return;
      }


      if (
        !Number.isFinite(serving) ||
        serving <= 0
      ) {

        alert(
          "Enter a valid reference amount greater than 0."
        );

        $("#customServing").focus();

        return;
      }


      const nutritionValues = [
        ["Carbohydrate", carbs, "#customCarbs"],
        ["Protein", protein, "#customProtein"],
        ["Fat", fat, "#customFat"],
        ["Calories", kcal, "#customKcal"]
      ];


      for (
        const [
          label,
          value,
          selector
        ]
        of nutritionValues
      ) {

        if (
          !Number.isFinite(value) ||
          value < 0
        ) {

          alert(
            label +
            " must be 0 or greater."
          );

          $(selector).focus();

          return;
        }
      }


      let ratio =
        null;


      if (
        mode !== "none"
      ) {

        if (
          !Number.isFinite(ratioRaw) ||
          ratioRaw < 1
        ) {

          alert(
            "Enter a conversion ratio of 1 or greater."
          );

          $("#customRatio").focus();

          return;
        }

        ratio =
          ratioRaw;
      }


      const food = {

        name,

        description:
          $("#customDescription")
            .value
            .trim(),

        type:
          $("#customType").value,

        serving:
          barcodeFormNumber(
            serving,
            1
          ),

        unit:
          $("#customUnit").value,

        carbs:
          barcodeFormNumber(
            carbs,
            0
          ),

        protein:
          barcodeFormNumber(
            protein,
            0
          ),

        fat:
          barcodeFormNumber(
            fat,
            0
          ),

        kcal:
          barcodeFormNumber(
            kcal,
            0
          ),

        ratio:
          mode === "none"
            ? null
            : barcodeFormNumber(
                ratio,
                null
              ),

        conversion:
          mode
      };


      if (
        editingFoodIndex === null ||
        editingFoodIndex === undefined
      ) {

        db.supportFoods.push(
          food
        );

      } else {

        db.supportFoods[
          editingFoodIndex
        ] =
          food;
      }


      localStorage.setItem(
        KEY,
        JSON.stringify(db)
      );


      editingFoodIndex =
        null;


      stopBarcodeCamera();


      if (
        typeof resetNutritionLabelScanner ===
        "function"
      ) {

        resetNutritionLabelScanner();
      }


      $("#foodEditorDialog")
        .close();


      renderSupportFoods();

      render();
    };
}


function dominantBase(c,p,f){
  if(p>=c&&p>=f)return 'Protein base';
  if(f>=c&&f>=p)return 'Fat base';
  return 'Carbohydrates base';
}
