with import (fetchTarball {
  name = "8ad5e8";
  url = https://github.com/NixOS/nixpkgs/archive/8ad5e8132c5dcf977e308e7bf5517cc6cc0bf7d8.tar.gz;
  sha256 = "17v6wigks04x1d63a2wcd7cc4z9ca6qr0f4xvw1pdw83f8a3c0nj";
}) {};

stdenv.mkDerivation {
    name = "node";
        buildInputs = [
        nodejs-14_x
        python3
        openssl
        postgresql
    ];
    shellHook = ''
        export PATH="$PWD/node_modules/.bin/:$PATH"
    '';
}