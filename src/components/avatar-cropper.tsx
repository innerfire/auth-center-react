import React, { useCallback, useRef, useState } from "react";
import { Button, Modal, message } from "antd";
import { PictureOutlined } from "@ant-design/icons";
import { blobToDataUrl, validateAvatarFile } from "../utils";
import { styles } from "./styles";

interface AvatarCropperProps {
  open: boolean;
  onClose: () => void;
  onCropped: (blob: Blob) => void;
}

const OUTPUT_SIZE = 512;

export function AvatarCropper({
  open,
  onClose,
  onCropped,
}: AvatarCropperProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  React.useEffect(() => {
    if (!open) return;
    setPreview(null);
    setImage(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [open]);

  const handleFile = useCallback(async (file: File) => {
    const validationError = validateAvatarFile(file);
    if (validationError) {
      message.error(validationError);
      return;
    }

    const dataUrl = await blobToDataUrl(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setPreview(dataUrl);
    };
    nextImage.onerror = () => message.error("无法读取图片，请重新选择");
    nextImage.src = dataUrl;
  }, []);

  const getCroppedBlob = useCallback(async (): Promise<Blob | null> => {
    if (!image) return null;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const imageAspect = image.naturalWidth / image.naturalHeight;
    let drawWidth: number;
    let drawHeight: number;
    if (imageAspect > 1) {
      drawHeight = OUTPUT_SIZE * scale;
      drawWidth = drawHeight * imageAspect;
    } else {
      drawWidth = OUTPUT_SIZE * scale;
      drawHeight = drawWidth / imageAspect;
    }

    const stageToOutput = OUTPUT_SIZE / 240;
    const x = (OUTPUT_SIZE - drawWidth) / 2 + offset.x * stageToOutput;
    const y = (OUTPUT_SIZE - drawHeight) / 2 + offset.y * stageToOutput;
    context.drawImage(image, x, y, drawWidth, drawHeight);

    return new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
  }, [image, offset, scale]);

  const handleCrop = useCallback(async () => {
    setCropping(true);
    try {
      const blob = await getCroppedBlob();
      if (!blob) {
        message.error("裁剪失败，请重试");
        return;
      }
      onCropped(blob);
      onClose();
    } finally {
      setCropping(false);
    }
  }, [getCroppedBlob, onClose, onCropped]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.currentTarget.value = "";
        }}
      />
      <Modal
        title="裁剪头像"
        open={open}
        onCancel={onClose}
        width={420}
        destroyOnHidden
        rootClassName={styles.cropperDialog}
        footer={[
          <Button key="cancel" onClick={onClose}>
            取消
          </Button>,
          <Button
            key="crop"
            type="primary"
            disabled={!image}
            loading={cropping}
            onClick={handleCrop}
          >
            确认裁剪
          </Button>,
        ]}
      >
        {!preview || !image ? (
          <div className={styles.cropEmpty}>
            <PictureOutlined
              aria-hidden
              style={{ color: "#615d59", fontSize: 28 }}
            />
            <Button
              type="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              选择图片
            </Button>
            <p className={styles.fieldHint}>
              支持 JPG、PNG，文件不超过 2 MiB
            </p>
          </div>
        ) : (
          <>
            <div
              className={styles.cropStage}
              onPointerDown={(event) => {
                setDragging(true);
                dragStart.current = {
                  x: event.clientX,
                  y: event.clientY,
                  ox: offset.x,
                  oy: offset.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!dragging) return;
                setOffset({
                  x: dragStart.current.ox + event.clientX - dragStart.current.x,
                  y: dragStart.current.oy + event.clientY - dragStart.current.y,
                });
              }}
              onPointerUp={(event) => {
                setDragging(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => setDragging(false)}
            >
              <img
                src={preview}
                alt="裁剪预览"
                draggable={false}
                className={styles.cropPreview}
                style={{
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                }}
              />
              <div className={styles.cropMask} aria-hidden />
            </div>
            <label className={styles.zoomControl}>
              <span>缩放</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.01}
                value={scale}
                onChange={(event) =>
                  setScale(Number.parseFloat(event.target.value))
                }
                aria-label="缩放比例"
              />
            </label>
          </>
        )}
      </Modal>
    </>
  );
}
