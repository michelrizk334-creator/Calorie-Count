// =========================================================
// BARCODE SCANNER
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

    /*
     * We use the SAME Cloudflare Worker
     * as the nutrition-label AI scanner.
     */

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
     *
     * Nothing is automatically saved.
     * You still review the values and
     * press Save Food yourself.
     */


    if (nutrition.product_name) {

      $("#customName").value =
        nutrition.product_name;
    }


    $("#customServing").value =
      Number(
        nutrition.reference_amount
      ) || 100;


    /*
     * Convert Cloudflare units to the
     * exact values already used by
     * your existing app.
     */

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


    $("#customCarbs").value =
      Number(
        nutrition.carbs_g
      ) || 0;


    $("#customProtein").value =
      Number(
        nutrition.protein_g
      ) || 0;


    $("#customFat").value =
      Number(
        nutrition.fat_g
      ) || 0;


    $("#customKcal").value =
      Number(
        nutrition.calories_kcal
      ) || 0;


    /*
     * Automatically determine
     * carbohydrate / protein / fat base
     * using your EXISTING function.
     */

    $("#customType").value =
      dominantBase(

        Number(
          nutrition.carbs_g
        ) || 0,

        Number(
          nutrition.protein_g
        ) || 0,

        Number(
          nutrition.fat_g
        ) || 0

      );


    /*
     * Barcode products don't automatically
     * receive a raw/cooked conversion.
     */

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
      ". Review the values, then press Save Food.";


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


    /*
     * BarcodeDetector is available on
     * supported browsers such as Chrome.
     */

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


/*
 * Also allow Enter after typing
 * the barcode.
 */

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

function dominantBase(c,p,f){if(p>=c&&p>=f)return 'Protein base';if(f>=c&&f>=p)return 'Fat base';return 'Carbohydrates base'}
