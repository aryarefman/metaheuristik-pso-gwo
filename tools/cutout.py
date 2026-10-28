"""
Cutout tool: creates transparent PNG mascots from source-art with zero holes inside the subject.
Uses boundary flood fill and contour filling so cream/white muzzle and chest fur remain 100% solid.
"""
import os
import cv2
import numpy as np

def extract_mascot_solid(src_path, dst_path, max_dim=1024):
    img = cv2.imread(src_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read {src_path}")
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        s = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

    # Sample background border points (top, left, right edges, and bottom corners)
    border_pts = []
    for x in range(0, w, 8):
        border_pts.append((0, x))
    for y in range(0, h, 8):
        border_pts.append((y, 0))
        border_pts.append((y, w - 1))
    for x in list(range(0, int(w * 0.22), 8)) + list(range(int(w * 0.78), w, 8)):
        border_pts.append((h - 1, x))

    bg_colors = np.array([lab[y, x] for y, x in border_pts])

    # Fit 2D polynomial surface to background L, a, b
    coords = np.array([[1.0, x, y, y * y] for y, x in border_pts])
    w_L, _, _, _ = np.linalg.lstsq(coords, bg_colors[:, 0], rcond=None)
    w_A, _, _, _ = np.linalg.lstsq(coords, bg_colors[:, 1], rcond=None)
    w_B, _, _, _ = np.linalg.lstsq(coords, bg_colors[:, 2], rcond=None)

    grid_y, grid_x = np.mgrid[0:h, 0:w]
    basis = np.stack([np.ones_like(grid_x), grid_x, grid_y, grid_y * grid_y], axis=-1)

    est_L = np.sum(basis * w_L, axis=-1)
    est_A = np.sum(basis * w_A, axis=-1)
    est_B = np.sum(basis * w_B, axis=-1)

    diff_L = lab[:, :, 0] - est_L
    diff_A = lab[:, :, 1] - est_A
    diff_B = lab[:, :, 2] - est_B

    delta_e = np.sqrt(0.6 * (diff_L ** 2) + 2.8 * (diff_A ** 2) + 2.8 * (diff_B ** 2))

    # Binary foreground detection
    bin_fg = (delta_e > 16.0).astype(np.uint8)

    # In the bottom 18%, remove flat shadow
    cutoff_y = int(h * 0.82)
    chroma_diff = np.sqrt(diff_A[cutoff_y:, :] ** 2 + diff_B[cutoff_y:, :] ** 2)
    bin_fg[cutoff_y:, :][chroma_diff < 14.0] = 0

    # Retain ONLY the primary mascot component
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(bin_fg)
    if num_labels > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        mascot = (labels == largest).astype(np.uint8)
    else:
        mascot = bin_fg

    # CRITICAL: Fill ALL internal holes so muzzle, chest, eyes, belly are 100% solid
    contours, hierarchy = cv2.findContours(mascot, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    solid_mask = np.zeros_like(mascot)
    cv2.drawContours(solid_mask, contours, -1, 255, -1)

    # Smooth the outer contour slightly for anti-aliasing
    alpha = cv2.GaussianBlur(solid_mask, (5, 5), 0)

    # Crop to bounding box
    y_idx, x_idx = np.where(alpha > 10)
    pad = 14
    y_min, y_max = max(0, np.min(y_idx) - pad), min(h, np.max(y_idx) + pad)
    x_min, x_max = max(0, np.min(x_idx) - pad), min(w, np.max(x_idx) + pad)

    img_cropped = img[y_min:y_max, x_min:x_max]
    alpha_cropped = alpha[y_min:y_max, x_min:x_max]

    b, g, r = cv2.split(img_cropped)
    rgba = cv2.merge([b, g, r, alpha_cropped])

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    cv2.imwrite(dst_path, rgba)
    print(f"Exported solid cutout: {dst_path} ({rgba.shape[1]}x{rgba.shape[0]})")

if __name__ == "__main__":
    extract_mascot_solid("docs/source-art/eagle-original.jpg", "assets/mascots/eagle.png")
    extract_mascot_solid("docs/source-art/wolf-original.jpg", "assets/mascots/wolf.png")
