# Build the APK from source

This open-source pack does **not** ship a prebuilt APK (avoids baking production API URLs or demo credentials into a public binary).

```bash
cd ..   # xecute-android/
npm install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`
