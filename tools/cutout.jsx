app.displayDialogs = DialogModes.NO;
var log = [];
var doc = app.open(new File("/private/tmp/claude-501/-Users-aaronsmith--claude-spares-spare-kwXd48/05b6774a-29de-4d1b-a1ad-f55df5d5700b/scratchpad/ig-full/p_brick.jpg"));
try { doc.activeLayer.isBackgroundLayer = false; } catch (e) {}
try {
  executeAction(stringIDToTypeID("removeBackground"), new ActionDescriptor(), DialogModes.NO);
  log.push("removeBackground ok");
} catch (e) {
  log.push("removeBackground failed: " + e);
  var d = new ActionDescriptor(); d.putBoolean(stringIDToTypeID("sampleAllLayers"), false);
  executeAction(stringIDToTypeID("autoCutout"), d, DialogModes.NO);
  var m = new ActionDescriptor(); m.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
  var r = new ActionReference(); r.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  m.putReference(charIDToTypeID("At  "), r); m.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
  executeAction(charIDToTypeID("Mk  "), m, DialogModes.NO);
  log.push("autoCutout + mask ok");
}
// apply the layer mask
var a = new ActionDescriptor(); var ar = new ActionReference();
ar.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
a.putReference(charIDToTypeID("null"), ar); a.putBoolean(charIDToTypeID("Aply"), true);
executeAction(charIDToTypeID("Dlt "), a, DialogModes.NO); log.push("mask applied");
// kill the red stage-light spill on the edges
try { var df = new ActionDescriptor(); df.putUnitDouble(charIDToTypeID("Wdth"), charIDToTypeID("#Pxl"), 3);
  executeAction(stringIDToTypeID("defringe"), df, DialogModes.NO); log.push("defringe ok"); } catch (e) { log.push("defringe failed: " + e); }
doc.trim(TrimType.TRANSPARENT, true, true, true, true);
doc.resizeImage(undefined, new UnitValue(1600, "px"), 72, ResampleMethod.BICUBICSHARPER);
var o = new ExportOptionsSaveForWeb(); o.format = SaveDocumentType.PNG; o.PNG8 = false; o.transparency = true; o.interlaced = false;
doc.exportDocument(new File("/private/tmp/claude-501/-Users-aaronsmith--claude-spares-spare-kwXd48/05b6774a-29de-4d1b-a1ad-f55df5d5700b/scratchpad/ps/cutout.png"), ExportType.SAVEFORWEB, o);
log.push("exported " + doc.width + "x" + doc.height);
doc.close(SaveOptions.DONOTSAVECHANGES);
log.join(" | ");
