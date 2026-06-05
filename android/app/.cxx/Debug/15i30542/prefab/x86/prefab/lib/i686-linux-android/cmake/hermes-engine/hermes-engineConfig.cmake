if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/shash/.gradle/caches/8.10.2/transforms/fbfaa723d48cff552f1a100595b2d414/transformed/hermes-android-0.76.0-debug/prefab/modules/libhermes/libs/android.x86/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/shash/.gradle/caches/8.10.2/transforms/fbfaa723d48cff552f1a100595b2d414/transformed/hermes-android-0.76.0-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

