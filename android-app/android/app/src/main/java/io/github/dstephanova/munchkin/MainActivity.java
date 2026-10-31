package io.github.dstephanova.munchkin;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CyclePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
