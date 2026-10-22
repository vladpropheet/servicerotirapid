#!/bin/sh
# rclone legat de stocarea din afara serverului (variabilele BACKUP_S3_*), sub numele „extern:”.
#   s3.sh ls "extern:$BACKUP_S3_BUCKET/servicerotirapid"                       -> ce backup-uri există
#   s3.sh copy "extern:$BACKUP_S3_BUCKET/servicerotirapid/db-....age" /backups  -> descarcă unul pe server
set -eu
: "${BACKUP_S3_BUCKET:?Lipsește BACKUP_S3_BUCKET (stocarea din afara serverului nu e configurată).}"
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_EXTERN_TYPE=s3
export RCLONE_CONFIG_EXTERN_PROVIDER=Other
export RCLONE_CONFIG_EXTERN_ENDPOINT="${BACKUP_S3_ENDPOINT:?Lipsește BACKUP_S3_ENDPOINT.}"
export RCLONE_CONFIG_EXTERN_REGION="${BACKUP_S3_REGION:-}"
export RCLONE_CONFIG_EXTERN_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:?Lipsește BACKUP_S3_ACCESS_KEY_ID.}"
export RCLONE_CONFIG_EXTERN_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:?Lipsește BACKUP_S3_SECRET_ACCESS_KEY.}"
exec rclone "$@"
