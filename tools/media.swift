// Media prep for the NOVUH site (macOS). Build: swiftc -O tools/media.swift -o /tmp/media
//   cutout <in.jpg> <out.png> <maxH>        person cutout via Vision (subject mask + person matte for ears/hair)
//   enc <in.mp4> <out.mp4> <start> <dur> <width> <kbps>   muted, bitrate-capped H.264 web loop
//   poster <in.mp4> <out.jpg>               first-frame poster

import Foundation
import Vision
import CoreImage
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }

// cutout <in.jpg> <out.png> <maxHeight>
func cutout(_ inPath: String, _ outPath: String, _ maxH: CGFloat) {
    guard let src = CIImage(contentsOf: URL(fileURLWithPath: inPath)) else { fail("read \(inPath)") }
    let img = src.oriented(.up)
    let req = VNGenerateForegroundInstanceMaskRequest()
    let h = VNImageRequestHandler(ciImage: img)
    do { try h.perform([req]) } catch { fail("vision \(error)") }
    guard let obs = req.results?.first else { fail("no subject found") }
    // keep the largest instance (the person)
    let all = obs.allInstances
    var best = all.first!; var bestArea = 0
    for i in all {
        let m = try! obs.generateScaledMaskForImage(forInstances: [i], from: h)
        let w = CVPixelBufferGetWidth(m), hh = CVPixelBufferGetHeight(m)
        CVPixelBufferLockBaseAddress(m, .readOnly)
        let base = CVPixelBufferGetBaseAddress(m)!.assumingMemoryBound(to: Float32.self)
        let stride = CVPixelBufferGetBytesPerRow(m) / 4
        var a = 0
        for y in Swift.stride(from: 0, to: hh, by: 8) { for x in Swift.stride(from: 0, to: w, by: 8) { if base[y * stride + x] > 0.5 { a += 1 } } }
        CVPixelBufferUnlockBaseAddress(m, .readOnly)
        if a > bestArea { bestArea = a; best = i }
    }
    let mask = try! obs.generateScaledMaskForImage(forInstances: [best], from: h)
    // union with the dedicated person matte, which keeps ears/hair the generic subject mask can clip
    let pr = VNGeneratePersonSegmentationRequest(); pr.qualityLevel = .accurate; pr.outputPixelFormat = kCVPixelFormatType_OneComponent8
    try? h.perform([pr])
    var maskImg = CIImage(cvPixelBuffer: mask)
    if let pm = pr.results?.first?.pixelBuffer {
        var pmi = CIImage(cvPixelBuffer: pm)
        pmi = pmi.transformed(by: CGAffineTransform(scaleX: img.extent.width / pmi.extent.width, y: img.extent.height / pmi.extent.height))
        // sharpen the matte, then only allow it inside a narrow band around the subject mask (fills ears, drops background junk)
        pmi = pmi.applyingFilter("CIColorMatrix", parameters: ["inputRVector": CIVector(x: 3, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 3, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 3, w: 0), "inputBiasVector": CIVector(x: -1.2, y: -1.2, z: -1.2, w: 0)]).applyingFilter("CIColorClamp")
        let band = maskImg.applyingFilter("CIMorphologyMaximum", parameters: ["inputRadius": img.extent.width * 0.012]).cropped(to: img.extent)
        let limited = pmi.applyingFilter("CIMinimumCompositing", parameters: [kCIInputBackgroundImageKey: band]).cropped(to: img.extent)
        maskImg = maskImg.applyingFilter("CIMaximumCompositing", parameters: [kCIInputBackgroundImageKey: limited]).cropped(to: img.extent)
    }
    let clear = CIImage(color: .clear).cropped(to: img.extent)
    var out = img.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: maskImg])
    // crop to subject bounds with a little padding
    var box = CGRect.null
    do {
        CVPixelBufferLockBaseAddress(mask, .readOnly)
        let w = CVPixelBufferGetWidth(mask), hh = CVPixelBufferGetHeight(mask)
        let base = CVPixelBufferGetBaseAddress(mask)!.assumingMemoryBound(to: Float32.self)
        let st = CVPixelBufferGetBytesPerRow(mask) / 4
        for y in Swift.stride(from: 0, to: hh, by: 4) { for x in Swift.stride(from: 0, to: w, by: 4) where base[y * st + x] > 0.3 {
            box = box.union(CGRect(x: x, y: hh - y, width: 4, height: 4)) } }
        CVPixelBufferUnlockBaseAddress(mask, .readOnly)
    }
    box = box.insetBy(dx: -20, dy: -20).intersection(img.extent)
    out = out.cropped(to: box).transformed(by: CGAffineTransform(translationX: -box.minX, y: -box.minY))
    let s = min(1, maxH / box.height)
    out = out.transformed(by: CGAffineTransform(scaleX: s, y: s))
    let ctx = CIContext()
    guard let cg = ctx.createCGImage(out, from: out.extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)) else { fail("render") }
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, cg, nil); CGImageDestinationFinalize(dest)
    print("cutout \(outPath) \(cg.width)x\(cg.height)")
}

// loop <in.mp4> <out.mp4> <start> <duration> <preset>
func loop(_ inPath: String, _ outPath: String, _ start: Double, _ dur: Double, _ preset: String) async {
    let asset = AVURLAsset(url: URL(fileURLWithPath: inPath))
    guard let vt = try? await asset.loadTracks(withMediaType: .video).first else { fail("no video") }
    let comp = AVMutableComposition()
    let ct = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    let total = try! await asset.load(.duration).seconds
    let d = min(dur, total - start)
    try! ct.insertTimeRange(CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), duration: CMTime(seconds: d, preferredTimescale: 600)), of: vt, at: .zero)
    ct.preferredTransform = try! await vt.load(.preferredTransform)
    try? FileManager.default.removeItem(atPath: outPath)
    guard let ex = AVAssetExportSession(asset: comp, presetName: preset) else { fail("preset") }
    ex.shouldOptimizeForNetworkUse = true
    do { try await ex.export(to: URL(fileURLWithPath: outPath), as: .mp4) } catch { fail("export \(error)") }
    let sz = (try? FileManager.default.attributesOfItem(atPath: outPath)[.size] as? Int) ?? 0
    print("loop \(outPath) \(String(format: "%.1f", d))s of \(String(format: "%.1f", total))s \(sz / 1024)KB")
}


// enc <in.mp4> <out.mp4> <start> <duration> <width> <kbps>  — muted, bitrate-capped H.264 for the web
func enc(_ inPath: String, _ outPath: String, _ start: Double, _ dur: Double, _ outW: Int, _ kbps: Int) async {
    let asset = AVURLAsset(url: URL(fileURLWithPath: inPath))
    guard let vt = try? await asset.loadTracks(withMediaType: .video).first else { fail("no video") }
    let nat = try! await vt.load(.naturalSize), tf = try! await vt.load(.preferredTransform)
    let disp = nat.applying(tf); let sw = abs(disp.width), sh = abs(disp.height)
    let W = outW & ~1, H = Int((Double(outW) * Double(sh) / Double(sw)).rounded()) & ~1
    let reader = try! AVAssetReader(asset: asset)
    reader.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), duration: CMTime(seconds: dur, preferredTimescale: 600))
    let vc = AVMutableVideoComposition(); vc.renderSize = CGSize(width: W, height: H)
    vc.frameDuration = CMTime(value: 1, timescale: 30)
    let ins = AVMutableVideoCompositionInstruction(); ins.timeRange = CMTimeRange(start: .zero, duration: try! await asset.load(.duration))
    let li = AVMutableVideoCompositionLayerInstruction(assetTrack: vt)
    let s = CGFloat(W) / sw
    li.setTransform(tf.concatenating(CGAffineTransform(scaleX: s, y: s)), at: .zero)
    ins.layerInstructions = [li]; vc.instructions = [ins]
    let out = AVAssetReaderVideoCompositionOutput(videoTracks: [vt], videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    out.videoComposition = vc; reader.add(out)
    try? FileManager.default.removeItem(atPath: outPath)
    let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: outPath), fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let wi = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: kbps * 1000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                                          AVVideoMaxKeyFrameIntervalKey: 60, AVVideoExpectedSourceFrameRateKey: 30]])
    wi.expectsMediaDataInRealTime = false; writer.add(wi)
    reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: CMTime(seconds: start, preferredTimescale: 600))
    while let sb = out.copyNextSampleBuffer() {
        while !wi.isReadyForMoreMediaData { usleep(2000) }
        wi.append(sb)
    }
    wi.markAsFinished(); await writer.finishWriting()
    if writer.status != .completed { fail("write \(String(describing: writer.error))") }
    let sz = (try? FileManager.default.attributesOfItem(atPath: outPath)[.size] as? Int) ?? 0
    print("enc \(outPath) \(W)x\(H) \(dur)s \(sz / 1024)KB")
}


// poster <in.mp4> <out.jpg>  — first frame as a JPEG poster
func poster(_ inPath: String, _ outPath: String) async {
    let g = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: inPath))); g.appliesPreferredTrackTransform = true
    guard let (cg, _) = try? await g.image(at: CMTime(seconds: 0.2, preferredTimescale: 600)) else { fail("frame") }
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, cg, [kCGImageDestinationLossyCompressionQuality: 0.7] as CFDictionary); CGImageDestinationFinalize(d)
    print("poster \(outPath) \(cg.width)x\(cg.height)")
}
switch args.count > 1 ? args[1] : "" {
case "cutout": cutout(args[2], args[3], CGFloat(Double(args[4])!))
case "loop":
    let sem = DispatchSemaphore(value: 0)
    Task { await loop(args[2], args[3], Double(args[4])!, Double(args[5])!, args[6]); sem.signal() }
    sem.wait()
case "enc":
    let sem = DispatchSemaphore(value: 0)
    Task { await enc(args[2], args[3], Double(args[4])!, Double(args[5])!, Int(args[6])!, Int(args[7])!); sem.signal() }
    sem.wait()
case "poster":
    let sem = DispatchSemaphore(value: 0)
    Task { await poster(args[2], args[3]); sem.signal() }
    sem.wait()
default: fail("usage")
}
