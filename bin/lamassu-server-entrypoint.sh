#!/usr/bin/env bash
CERT_FILES=(
  /lamassu-data/certs/{Lamassu_CA,Lamassu_OP,Lamassu_OP_Root_CA}.pem
  /lamassu-data/certs/Lamassu_OP_Root_CA.srl
  /lamassu-data/private/{Lamassu_OP,Lamassu_OP_Root_CA}.key
)

echo "Checking for Lamassu certificates..."

if ! (( ${#CERT_FILES[@]} == $(ls "${CERT_FILES[@]}" 2>/dev/null | wc -l) )); then
    echo "Some certificates are missing. Building them..."
    bash /lamassu-server/tools/build-docker-certs.sh
fi

echo "Upcate certs on alpine"
cp /lamassu-data/certs/Lamassu_CA.pem /usr/local/share/ca-certificates
cp /lamassu-data/certs/Lamassu_OP_Root_CA.pem /usr/local/share/ca-certificates
update-ca-certificates

echo "Executing migrations..."
node /lamassu-server/bin/lamassu-migrate

echo "Starting server..."
node /lamassu-server/bin/lamassu-server

