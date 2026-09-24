import React from "react";
import { UserOutlined } from "@ant-design/icons";
import { StyledAvatarFallback, StyledAvatarImage } from "./styles";

export interface AvatarImageProps {
  src?: string | null;
  size?: number;
  themeColor?: string;
  className?: string;
}

export function AvatarImage({
  src,
  size = 32,
  themeColor = "#0075de",
  className,
}: AvatarImageProps) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <StyledAvatarFallback
        role="img"
        aria-label="用户头像"
        className={className}
        $size={size}
        $themeColor={themeColor}
      >
        <UserOutlined aria-hidden />
      </StyledAvatarFallback>
    );
  }

  return (
    <StyledAvatarImage
      src={src}
      alt="用户头像"
      width={size}
      height={size}
      className={className}
      $size={size}
      onError={() => setFailed(true)}
    />
  );
}
