if(NOT TARGET react-native-worklets-core::rnworklets)
add_library(react-native-worklets-core::rnworklets SHARED IMPORTED)
set_target_properties(react-native-worklets-core::rnworklets PROPERTIES
    IMPORTED_LOCATION "C:/Hackathons/nhai-datalake-hackathon_7.0/node_modules/react-native-worklets-core/android/build/intermediates/cxx/Debug/6x4d5v4p/obj/arm64-v8a/librnworklets.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Hackathons/nhai-datalake-hackathon_7.0/node_modules/react-native-worklets-core/android/build/headers/rnworklets"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

